// The chain side of tipping: reads and plain transfers through one RPC url. Every write here moves
// real funds, and nothing in this file is covered by an automated test.
import { createPublicClient, createWalletClient, erc20Abi, erc721Abi, http } from 'viem';
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

interface SendTransferOptions {
  rpcUrl: string;
  privateKey: Hex;
  token: ChainToken;
  to: string;
  // base units for native and erc20, the token id for erc721
  amountOrTokenId: bigint;
}

// One plain transfer from the in-app wallet, returned as soon as it is broadcast. A plain transfer
// is what tipping/v1 verifies: the Transfer event, or for the native coin the transaction itself.
// Refuses to send unless the RPC reports the token's chain id.
export const sendTransfer = async ({ rpcUrl, privateKey, token, to, amountOrTokenId }: SendTransferOptions): Promise<Hash> => {
  await ensureRpcChainId(rpcUrl, token.chainId);
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({ account, transport: http(rpcUrl) });
  if (token.type === 'native') {
    return client.sendTransaction({ chain: null, to: to as Address, value: amountOrTokenId });
  }
  if (token.type === 'erc20') {
    return client.writeContract({ chain: null, address: token.address as Address, abi: erc20Abi, functionName: 'transfer', args: [to as Address, amountOrTokenId] });
  }
  return client.writeContract({
    chain: null,
    address: token.address as Address,
    abi: erc721Abi,
    functionName: 'safeTransferFrom',
    args: [account.address, to as Address, amountOrTokenId],
  });
};

// resolves once the transaction is mined, and rejects if it reverted
export const waitForTransaction = async (rpcUrl: string, hash: string): Promise<void> => {
  const receipt = await getPublicClient(rpcUrl).waitForTransactionReceipt({ hash: hash as Hash });
  if (receipt.status !== 'success') {
    throw Error(`transaction ${hash} reverted`);
  }
};

export const getWalletAddress = (privateKey: Hex): Address => privateKeyToAccount(privateKey).address;

export const signWalletMessage = (privateKey: Hex, message: string): Promise<Hex> => privateKeyToAccount(privateKey).signMessage({ message });

export interface OnChainTipCheck {
  mined: boolean;
  succeeded: boolean;
  matchesTip: boolean;
  // the block's time in seconds, which has to be later than the tipped comment
  blockTimestamp: number;
}

interface TransferToCheck {
  txHash: string;
  type: TipTokenType;
  // the token contract; undefined for native
  token?: string;
  from: string;
  to: string;
  amount?: bigint;
  tokenId?: string;
}

// keccak256("Transfer(address,address,uint256)")
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Looks one transaction up: mined, succeeded, and a transfer of that token, between those wallets,
// of at least that amount.
const checkTransferOnChain = async (client: PublicClient, transfer: TransferToCheck): Promise<OnChainTipCheck> => {
  const hash = transfer.txHash as Hash;
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => undefined);
  if (!receipt) {
    return { mined: false, succeeded: false, matchesTip: false, blockTimestamp: 0 };
  }
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const from = transfer.from.toLowerCase();
  const to = transfer.to.toLowerCase();
  let matchesTip = false;
  if (transfer.type === 'native') {
    const transaction = await client.getTransaction({ hash });
    matchesTip =
      transaction.from.toLowerCase() === from && transaction.to?.toLowerCase() === to && (transfer.amount === undefined || transaction.value >= transfer.amount);
  } else {
    const token = transfer.token?.toLowerCase();
    // ERC-20 and ERC-721 emit the same Transfer event; only the last argument differs (value or token id)
    matchesTip = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== token || log.topics[0] !== transferTopic) {
        return false;
      }
      const topicAddress = (topic: Hex | undefined) => `0x${(topic ?? '').slice(26)}`.toLowerCase();
      if (topicAddress(log.topics[1]) !== from || topicAddress(log.topics[2]) !== to) {
        return false;
      }
      if (transfer.type === 'erc721') {
        return log.topics[3] !== undefined && BigInt(log.topics[3]).toString() === transfer.tokenId;
      }
      return transfer.amount === undefined || BigInt(log.data) >= transfer.amount;
    });
  }
  return { mined: true, succeeded: receipt.status === 'success', matchesTip, blockTimestamp: Number(block.timestamp) };
};

export interface OnChainTipResult {
  tip: OnChainTipCheck;
  // undefined when the tip carries no fee
  fee?: OnChainTipCheck;
}

// Looks the tip's transaction, and its fee's, up on their chain. Rejects with the RPC's own error
// when the chain cannot be reached or reports another chain id.
export const checkTipOnChain = async (rpcUrl: string, tip: Tip): Promise<OnChainTipResult> => {
  await ensureRpcChainId(rpcUrl, tip.chainId);
  const client = getPublicClient(rpcUrl);
  const [tipCheck, feeCheck] = await Promise.all([
    checkTransferOnChain(client, tip),
    tip.fee
      ? checkTransferOnChain(client, {
          txHash: tip.fee.txHash,
          type: tip.fee.token ? 'erc20' : 'native',
          token: tip.fee.token,
          from: tip.from,
          to: tip.fee.to,
          amount: tip.fee.amount,
        })
      : undefined,
  ]);
  return { tip: tipCheck, fee: feeCheck };
};
