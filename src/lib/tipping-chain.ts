// The chain side of tipping: reads and plain transfers through one RPC url. Every write here moves
// real funds. The Node suite covers it against stub RPCs; nothing in it has moved funds on a live chain.
import {
  concatHex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  decodeFunctionResult,
  http,
  keccak256,
  parseTransaction,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
} from 'viem';
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
  // decimals read from a node on another chain would be another token's, and a tip typed in whole
  // tokens would then move the wrong amount
  await ensureRpcChainId(rpcUrl, token.chainId);
  const client = getPublicClient(rpcUrl);
  const address = token.address as Address;
  const symbol = await client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }).catch(() => shortAddress(address));
  if (token.type === 'erc721') {
    return { symbol, decimals: 0 };
  }
  // a failed read rejects, so getTokenInfo shows the fallback and reads again later; it is not cached as "no decimals"
  const decimals = await client.readContract({ address, abi: erc20Abi, functionName: 'decimals' });
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
    // A failed read is shown as the fallback, then forgotten a few seconds later so a corrected RPC url
    // or a recovered node is tried again. It is kept until then because React's use() asks for the
    // promise again after it settles, and a new promise each time would never render the fallback.
    tokenInfo = rpcUrl
      ? loadTokenInfo(rpcUrl, token).catch(() => {
          setTimeout(() => tokenInfos.delete(key), 5000);
          return fallback;
        })
      : Promise.resolve(token.type === 'native' ? { ...fallback, decimals: 18 } : fallback);
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

const balanceReads = new Map<string, Promise<bigint | undefined>>();
// one promise for a chain without an RPC url, so React's use() settles on it
const noBalance = Promise.resolve<bigint | undefined>(undefined);

// The same promise for the same wallet and token for a few seconds, so a component can read it with
// React's use() without a request per render. undefined when it can't be read, e.g. the RPC is on
// another chain. A failed read is kept for the window too: React asks for the promise again after it
// settles, and a new one each time would never show the result.
export const getBalanceOnce = (rpcUrl: string | undefined, token: ChainToken, owner: string): Promise<bigint | undefined> => {
  if (!rpcUrl) {
    return noBalance;
  }
  const key = `${rpcUrl}\n${token.chainId}\n${token.type}\n${token.address?.toLowerCase()}\n${owner.toLowerCase()}`;
  let read = balanceReads.get(key);
  if (!read) {
    read = ensureRpcChainId(rpcUrl, token.chainId)
      .then(() => getBalance(rpcUrl, token, owner))
      .catch(() => undefined);
    balanceReads.set(key, read);
    setTimeout(() => balanceReads.delete(key), 10_000);
  }
  return read;
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
const buildTransfer = ({ token, to: recipient, amountOrTokenId, parentBinding: suffix }: TransferOptions, from: Address) => {
  // a proven address may have any letter case, and viem refuses a mixed case one whose checksum is wrong
  const to = recipient.toLowerCase();
  if (token.type === 'native') {
    return { to: to as Address, value: amountOrTokenId, data: suffix };
  }
  const data =
    token.type === 'erc20'
      ? encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to as Address, amountOrTokenId] })
      : encodeFunctionData({ abi: erc721Abi, functionName: 'safeTransferFrom', args: [from, to as Address, amountOrTokenId] });
  return { to: token.address as Address, data: concatHex([data, suffix]) };
};

// The fees a transfer is signed with, so that the cost checked before sending is the cost sent: the
// node refuses a transaction whose balance does not cover gas times the fee cap. A chain without
// EIP-1559 fees is priced by its gas price.
const getFees = async (client: PublicClient): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | { gasPrice: bigint }> => {
  try {
    const { maxFeePerGas, maxPriorityFeePerGas } = await client.estimateFeesPerGas({ chain: null, type: 'eip1559' });
    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch {
    return { gasPrice: await client.getGasPrice() };
  }
};

// What sending would cost, without sending: the gas the transfer needs, and the most the transaction
// will pay per gas. A receiver with code, or a token contract that rejects trailing calldata, reverts
// here, before any money has moved. Rejects with the RPC's error then.
export const simulateTransfer = async (options: TransferOptions & { privateKey: Hex }): Promise<{ gas: bigint; gasPrice: bigint }> => {
  await ensureRpcChainId(options.rpcUrl, options.token.chainId);
  const account = privateKeyToAccount(options.privateKey);
  const client = getPublicClient(options.rpcUrl);
  const transaction = buildTransfer(options, account.address);
  const [gas, fees] = await Promise.all([client.estimateGas({ account, ...transaction }), getFees(client)]);
  if (options.token.type === 'erc20') {
    // a token that returns false instead of reverting passes the gas estimate and moves nothing
    const { data } = await client.call({ account, ...transaction });
    if (data && data !== '0x' && decodeFunctionResult({ abi: erc20Abi, functionName: 'transfer', data }) === false) {
      throw Error('the token returned false for this transfer, so it would move nothing');
    }
  }
  return { gas, gasPrice: 'gasPrice' in fees ? fees.gasPrice : fees.maxFeePerGas };
};

// A transfer signed here and not sent yet. Its hash is known before the RPC has seen it, so it can
// be saved first: a broadcast whose response is lost then leaves a record of what may be in the
// mempool, and `raw` can be sent again without signing a second transaction.
export interface SignedTransfer {
  hash: Hash;
  raw: Hex;
}

// A tip and its fee are signed back to back, before either is mined. `nonce` pins the transaction's
// place in the sender's queue: left to the RPC, the second could read a pending count that does not
// include the first yet and take the same nonce. Refuses to sign unless the RPC reports the token's chain id.
export const signTransfer = async (options: TransferOptions & { privateKey: Hex; nonce: number }): Promise<SignedTransfer> => {
  await ensureRpcChainId(options.rpcUrl, options.token.chainId);
  const account = privateKeyToAccount(options.privateKey);
  const walletClient = createWalletClient({ account, transport: http(options.rpcUrl) });
  const fees = await getFees(getPublicClient(options.rpcUrl));
  const request = await walletClient.prepareTransactionRequest({
    chain: null,
    ...buildTransfer(options, account.address),
    nonce: options.nonce,
    chainId: options.token.chainId,
    ...fees,
  });
  const raw = await walletClient.signTransaction(request);
  // an RPC that answered another chain id while signing would have the transaction signed for that chain
  if (parseTransaction(raw).chainId !== options.token.chainId) {
    throw Error(`the transaction was not signed for chain id ${options.token.chainId}. Nothing was sent`);
  }
  return { hash: keccak256(raw), raw };
};

// Only the RPC's "no such transaction" answer is no. A rate limit, a timeout or a backend error says
// nothing about the transaction, and reading it as unknown could drop one that was sent.
const isKnown = (client: PublicClient, hash: Hash): Promise<boolean> =>
  client.getTransaction({ hash }).then(
    () => true,
    (error: unknown) => {
      if (error instanceof TransactionNotFoundError) {
        return false;
      }
      throw error;
    },
  );

// Makes sure the RPC has a signed transfer: nothing is done when it already knows it, pending or mined,
// so this is safe to run again after a failure or a reload. A plain transfer is what tipping/v1
// verifies: the Transfer event, or for the native coin the transaction itself. Rejects with the RPC's
// error, which does not say whether the transaction was taken: see isTransferDead.
export const ensureBroadcast = async (rpcUrl: string, { hash, raw }: SignedTransfer): Promise<void> => {
  const client = getPublicClient(rpcUrl);
  if (await isKnown(client, hash)) {
    return;
  }
  try {
    await client.sendRawTransaction({ serializedTransaction: raw });
  } catch (error) {
    // another node of the RPC already had it, or it was mined in between
    if (
      /already known|(?<!un)known transaction|already imported/i.test(String((error as { details?: string; message?: string })?.details ?? (error as Error)?.message)) ||
      // an unclear answer here must not hide the error that is being handled
      (await isKnown(client, hash).catch(() => false))
    ) {
      return;
    }
    throw error;
  }
};

export const isTransactionKnown = (rpcUrl: string, hash: string): Promise<boolean> => isKnown(getPublicClient(rpcUrl), hash as Hash);

// The nonce a signed transaction takes
export const getSignedNonce = (raw: string): number => parseTransaction(raw as Hex).nonce ?? 0;

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Whether a signed transfer can never be mined: another transaction of its sender has used its nonce. An
// error from the RPC does not prove this, since an RPC answering from several nodes can refuse a transaction
// another node took or mined; only a used nonce does. And the node that counts nonces can be ahead of the one
// that is asked for the transaction, so a transaction not found is looked for again before it is given up on.
export const isTransferDead = async (rpcUrl: string, { hash, raw }: SignedTransfer, from: string, retryDelay = 5000): Promise<boolean> => {
  const client = getPublicClient(rpcUrl);
  if ((await client.getTransactionCount({ address: from as Address, blockTag: 'latest' })) <= getSignedNonce(raw)) {
    return false;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await isKnown(client, hash)) {
      return false;
    }
    if (attempt < 3) {
      await sleep(retryDelay);
    }
  }
  return true;
};

// the nonce the next transaction of this address takes, counting those still waiting to be mined
export const getPendingNonce = (rpcUrl: string, address: string): Promise<number> =>
  getPublicClient(rpcUrl).getTransactionCount({ address: address as Address, blockTag: 'pending' });

const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const topicAddress = (topic: Hex | undefined): string => `0x${(topic ?? '').slice(26)}`.toLowerCase();

interface ExpectedTransfer {
  // the token contract the Transfer event comes from
  token: string;
  to: string;
  amount: bigint;
}

// The transaction was mined and did not do what it should: it reverted, or moved nothing. Any other
// rejection of waitForTransaction (a timeout, an RPC error) says nothing about the transaction.
export class TransferFailedError extends Error {}

// resolves once the transaction is mined, and rejects if it reverted. With `expectedTransfer` it
// also rejects when the receipt holds no such Transfer: some tokens return false instead of
// reverting, so the transaction succeeds and nothing moves.
export const waitForTransaction = async (rpcUrl: string, hash: string, expectedTransfer?: ExpectedTransfer): Promise<void> => {
  const receipt = await getPublicClient(rpcUrl).waitForTransactionReceipt({ hash: hash as Hash });
  // a transaction of the same nonce that replaced it is a different transaction, mined or not
  if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
    throw new TransferFailedError(`transaction ${hash} was replaced by ${receipt.transactionHash}`);
  }
  if (receipt.status !== 'success') {
    throw new TransferFailedError(`transaction ${hash} reverted`);
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
    throw new TransferFailedError(`transaction ${hash} succeeded but moved nothing to ${expectedTransfer.to}`);
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
  // the wallet the tip says paid: the transfer must come from it, not from another wallet of the tipper's
  from?: string;
  to: string;
  amount?: bigint;
  tokenId?: string;
}

// Looks one transaction up, as tipping/v1 verifies it: mined, succeeded, sent by the tipper, ending
// with the parent binding, and a transfer of that token to that wallet of at least that amount.
const checkTransferOnChain = async (client: PublicClient, transfer: TransferToCheck, parentBinding: Hex): Promise<OnChainTipCheck> => {
  const hash = transfer.txHash as Hash;
  // only "no receipt yet" means not mined: a rate limit or a timeout says nothing about the transaction
  const receipt = await client.getTransactionReceipt({ hash }).catch((error: unknown) => {
    if (error instanceof TransactionReceiptNotFoundError) {
      return undefined;
    }
    throw error;
  });
  if (!receipt) {
    return { mined: false, succeeded: false, sentByTipper: false, hasBinding: false, matchesTip: false };
  }
  const transaction = await client.getTransaction({ hash });
  const senders = transfer.senders.map((sender) => sender.toLowerCase());
  const to = transfer.to.toLowerCase();
  const from = transfer.from?.toLowerCase();
  let matchesTip: boolean;
  if (transfer.type === 'native') {
    matchesTip =
      (from === undefined || transaction.from.toLowerCase() === from) &&
      transaction.to?.toLowerCase() === to &&
      (transfer.amount === undefined || transaction.value >= transfer.amount);
  } else {
    const token = transfer.token?.toLowerCase();
    // ERC-20 and ERC-721 emit the same Transfer event; only the last argument differs (value or token id)
    matchesTip = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== token || log.topics[0] !== transferTopic) {
        return false;
      }
      if (!(from === undefined ? senders : [from]).includes(topicAddress(log.topics[1])) || topicAddress(log.topics[2]) !== to) {
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
