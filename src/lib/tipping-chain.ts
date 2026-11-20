// The chain side of tipping: reads and plain transfers through one RPC url. Every write here moves
// real funds, and nothing in this file is covered by an automated test.
import { concatHex, createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, erc721Abi, http } from 'viem';
import type { Address, Hash, Hex, PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Tip, TipTokenType } from './tipping';

const publicClients = new Map<string, PublicClient>();

const getPublicClient = (rpcUrl: string): PublicClient => {
  let client = publicClients.get(rpcUrl);
  if (!client) {
    client = createPublicClient({ transport: http(rpcUrl) });
    publicClients.set(rpcUrl, client);
  }
  return client;
};

// The chain an RPC serves is whatever it reports, so every write asks first. Rejects when the RPC
// is on another chain than the one the tip is meant for: a transfer sent there would move funds on
// the wrong network, and the community would never find it.
export const ensureRpcChainId = async (rpcUrl: string, chainId: number): Promise<void> => {
  const reported = await getPublicClient(rpcUrl).getChainId();
  if (reported !== chainId) {
    throw Error(`the RPC set for chain id ${chainId} (${rpcUrl}) reports chain id ${reported}. Nothing was sent: set an RPC url of chain ${chainId} in settings`);
  }
};

// the coin of the chains a tip is likely to be tried on; any other chain's coin is named by its chain id
const nativeSymbols: Record<number, string> = { 1: 'ETH', 10: 'ETH', 137: 'POL', 8453: 'ETH', 42161: 'ETH', 11155111: 'SepoliaETH' };

const getNativeSymbol = (chainId: number): string => nativeSymbols[chainId] ?? `coin of chain ${chainId}`;

interface ChainToken {
  chainId: number;
  type: TipTokenType;
  // the token contract; undefined for native
  address?: string;
}

export interface TokenInfo {
  symbol: string;
  // undefined when the contract did not say, so amounts stay in base units
  decimals?: number;
}

const shortAddress = (address: string | undefined): string => (address ? `${address.substring(0, 6)}…${address.substring(address.length - 4)}` : '');

const loadTokenInfo = async (rpcUrl: string, token: ChainToken): Promise<TokenInfo> => {
  if (token.type === 'native') {
    // the chain's own coin, which has 18 decimals on every EVM chain
    return { symbol: getNativeSymbol(token.chainId), decimals: 18 };
  }
  const client = getPublicClient(rpcUrl);
  const address = token.address as Address;
  const symbol = await client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }).catch(() => shortAddress(address));
  if (token.type === 'erc721') {
    return { symbol, decimals: 0 };
  }
  const decimals = await client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }).catch(() => undefined);
  return { symbol, decimals };
};

const tokenInfos = new Map<string, Promise<TokenInfo>>();

// The same promise for the same token, so a component can read it with React's use(). It never
// rejects: a token whose contract can't be read is shown by its address, in base units.
export const getTokenInfo = (rpcUrl: string | undefined, token: ChainToken): Promise<TokenInfo> => {
  const key = `${rpcUrl}\n${token.chainId}\n${token.type}\n${token.address?.toLowerCase()}`;
  let tokenInfo = tokenInfos.get(key);
  if (!tokenInfo) {
    const fallback: TokenInfo = { symbol: token.type === 'native' ? getNativeSymbol(token.chainId) : shortAddress(token.address) };
    tokenInfo = rpcUrl ? loadTokenInfo(rpcUrl, token).catch(() => fallback) : Promise.resolve(token.type === 'native' ? { ...fallback, decimals: 18 } : fallback);
    tokenInfos.set(key, tokenInfo);
  }
  return tokenInfo;
};

// base units for native and erc20, the number of tokens held for erc721
export const getBalance = (rpcUrl: string, token: ChainToken, owner: string): Promise<bigint> => {
  const client = getPublicClient(rpcUrl);
  if (token.type === 'native') {
    return client.getBalance({ address: owner as Address });
  }
  return client.readContract({ address: token.address as Address, abi: erc20Abi, functionName: 'balanceOf', args: [owner as Address] });
};

interface TransferOptions {
  rpcUrl: string;
  token: ChainToken;
  to: string;
  // base units for native and erc20, the token id for erc721
  amountOrTokenId: bigint;
  // the parent binding of the comment being tipped (getParentBindingSuffix). Every transaction a
  // tip claim names ends with it. Passed in, not built here, so this file imports no relative values.
  parentBinding: Hex;
}

// The transaction of one plain transfer from `from`, ending with the parent binding (tipping/v1):
// the native coin is a direct send whose data is the suffix, a token transfer is the normal
// calldata followed by the suffix, which the ABI decoder ignores.
const buildTransfer = ({ token, to, amountOrTokenId, parentBinding: suffix }: TransferOptions, from: Address) => {
  if (token.type === 'native') {
    return { to: to as Address, value: amountOrTokenId, data: suffix };
  }
  const data =
    token.type === 'erc20'
      ? encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to as Address, amountOrTokenId] })
      : encodeFunctionData({ abi: erc721Abi, functionName: 'safeTransferFrom', args: [from, to as Address, amountOrTokenId] });
  return { to: token.address as Address, data: concatHex([data, suffix]) };
};

// What sending would cost, without sending: the gas the transfer needs, and the gas price now. A
// receiver with code, or a token contract that rejects trailing calldata, reverts here, before any
// money has moved. Rejects with the RPC's error then.
export const simulateTransfer = async (options: TransferOptions & { privateKey: Hex }): Promise<{ gas: bigint; gasPrice: bigint }> => {
  await ensureRpcChainId(options.rpcUrl, options.token.chainId);
  const account = privateKeyToAccount(options.privateKey);
  const client = getPublicClient(options.rpcUrl);
  const [gas, gasPrice] = await Promise.all([client.estimateGas({ account, ...buildTransfer(options, account.address) }), client.getGasPrice()]);
  return { gas, gasPrice };
};

// One plain transfer from the in-app wallet, returned as soon as it is broadcast. A plain transfer
// is what tipping/v1 verifies: the Transfer event, or for the native coin the transaction itself.
// Refuses to send unless the RPC reports the token's chain id.
export const sendTransfer = async (options: TransferOptions & { privateKey: Hex }): Promise<Hash> => {
  await ensureRpcChainId(options.rpcUrl, options.token.chainId);
  const account = privateKeyToAccount(options.privateKey);
  const client = createWalletClient({ account, transport: http(options.rpcUrl) });
  return client.sendTransaction({ chain: null, ...buildTransfer(options, account.address) });
};

const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const topicAddress = (topic: Hex | undefined): string => `0x${(topic ?? '').slice(26)}`.toLowerCase();

interface ExpectedTransfer {
  // the token contract the Transfer event comes from
  token: string;
  to: string;
  amount: bigint;
}

// resolves once the transaction is mined, and rejects if it reverted. With `expectedTransfer` it
// also rejects when the receipt holds no such Transfer: some tokens return false instead of
// reverting, so the transaction succeeds and nothing moves.
export const waitForTransaction = async (rpcUrl: string, hash: string, expectedTransfer?: ExpectedTransfer): Promise<void> => {
  const receipt = await getPublicClient(rpcUrl).waitForTransactionReceipt({ hash: hash as Hash });
  if (receipt.status !== 'success') {
    throw Error(`transaction ${hash} reverted`);
  }
  if (
    expectedTransfer &&
    !receipt.logs.some(
      (log) =>
        log.address.toLowerCase() === expectedTransfer.token.toLowerCase() &&
        log.topics[0] === transferTopic &&
        topicAddress(log.topics[2]) === expectedTransfer.to.toLowerCase() &&
        BigInt(log.data) >= expectedTransfer.amount,
    )
  ) {
    throw Error(`transaction ${hash} succeeded but moved nothing to ${expectedTransfer.to}`);
  }
};

export const getWalletAddress = (privateKey: Hex): Address => privateKeyToAccount(privateKey).address;

export const signWalletMessage = (privateKey: Hex, message: string): Promise<Hex> => privateKeyToAccount(privateKey).signMessage({ message });

export interface OnChainTipCheck {
  mined: boolean;
  succeeded: boolean;
  // sent by one of the tipper's proven wallets: the transaction's own sender, not a Transfer's
  sentByTipper: boolean;
  // ends with the parent binding of the tipped comment
  hasBinding: boolean;
  // moves the token, between those wallets, in at least that amount
  matchesTip: boolean;
}

interface TransferToCheck {
  txHash: string;
  type: TipTokenType;
  // the token contract; undefined for native
  token?: string;
  // the tipper's proven wallets: the transaction must be sent by one, and a token moves out of one
  senders: string[];
  to: string;
  amount?: bigint;
  tokenId?: string;
}

// Looks one transaction up, as tipping/v1 verifies it: mined, succeeded, sent by the tipper, ending
// with the parent binding, and a transfer of that token to that wallet of at least that amount.
const checkTransferOnChain = async (client: PublicClient, transfer: TransferToCheck, parentBinding: Hex): Promise<OnChainTipCheck> => {
  const hash = transfer.txHash as Hash;
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => undefined);
  if (!receipt) {
    return { mined: false, succeeded: false, sentByTipper: false, hasBinding: false, matchesTip: false };
  }
  const transaction = await client.getTransaction({ hash });
  const senders = transfer.senders.map((sender) => sender.toLowerCase());
  const to = transfer.to.toLowerCase();
  let matchesTip: boolean;
  if (transfer.type === 'native') {
    matchesTip = transaction.to?.toLowerCase() === to && (transfer.amount === undefined || transaction.value >= transfer.amount);
  } else {
    const token = transfer.token?.toLowerCase();
    // ERC-20 and ERC-721 emit the same Transfer event; only the last argument differs (value or token id)
    matchesTip = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== token || log.topics[0] !== transferTopic) {
        return false;
      }
      if (!senders.includes(topicAddress(log.topics[1])) || topicAddress(log.topics[2]) !== to) {
        return false;
      }
      if (transfer.type === 'erc721') {
        return log.topics[3] !== undefined && BigInt(log.topics[3]).toString() === transfer.tokenId;
      }
      return transfer.amount === undefined || BigInt(log.data) >= transfer.amount;
    });
  }
  return {
    mined: true,
    succeeded: receipt.status === 'success',
    sentByTipper: senders.includes(transaction.from.toLowerCase()),
    hasBinding: transaction.input.toLowerCase().endsWith(parentBinding.substring(2).toLowerCase()),
    matchesTip,
  };
};

export interface OnChainTipResult {
  tip: OnChainTipCheck;
  // undefined when the tip carries no fee
  fee?: OnChainTipCheck;
}

// Looks the tip's transaction, and its fee's, up on their chain. `senders` are the wallets the
// tipper has proven and `parentBinding` is the tipped comment's. Rejects with the RPC's own error when the
// chain cannot be reached or reports another chain id.
export const checkTipOnChain = async (rpcUrl: string, tip: Tip, senders: string[], parentBinding: Hex): Promise<OnChainTipResult> => {
  await ensureRpcChainId(rpcUrl, tip.chainId);
  const client = getPublicClient(rpcUrl);
  const [tipCheck, feeCheck] = await Promise.all([
    checkTransferOnChain(client, { ...tip, senders }, parentBinding),
    tip.fee
      ? checkTransferOnChain(
          client,
          { txHash: tip.fee.txHash, type: tip.fee.token ? 'erc20' : 'native', token: tip.fee.token, senders, to: tip.fee.to, amount: tip.fee.amount },
          parentBinding,
        )
      : undefined,
  ]);
  return { tip: tipCheck, fee: feeCheck };
};
