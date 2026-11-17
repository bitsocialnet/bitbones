// The chain side of tipping: reads and plain transfers through one RPC url. Every write here moves
// real funds, and nothing in this file is covered by an automated test.
import { createPublicClient, createWalletClient, erc20Abi, erc721Abi, http } from 'viem';
import type { Address, Hash, Hex, PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { TipTokenType } from './tipping';

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
