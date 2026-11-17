import { setAccount, useAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Account, Wallet } from '@bitsocial/bitsocial-react-hooks';
import { useEffect } from 'react';
import type { Hex } from 'viem';
import {
  getEthPrivateKeyFromSignerPrivateKey,
  getKeyAddressFromPublicKey,
  getWalletMessageToSign,
  getWalletProofError,
  normalizeWalletSignature,
  walletSignatureType,
} from '../lib/tipping';
import { getWalletAddress, signWalletMessage } from '../lib/tipping-chain';

interface InAppWallet {
  privateKey: Hex;
  address: string;
}

const inAppWallets = new Map<string, InAppWallet>();

// The wallet bitbones holds the key of: the account's own signing key used as an Ethereum key. The
// hooks library links this wallet to every account it generates, as author.wallets.eth.
export const getInAppWallet = (account: Account | undefined): InAppWallet | undefined => {
  const signerPrivateKey: unknown = account?.signer?.privateKey;
  if (typeof signerPrivateKey !== 'string') {
    return undefined;
  }
  let wallet = inAppWallets.get(signerPrivateKey);
  if (!wallet) {
    const privateKey = getEthPrivateKeyFromSignerPrivateKey(signerPrivateKey);
    if (!privateKey) {
      return undefined;
    }
    wallet = { privateKey, address: getWalletAddress(privateKey) };
    inAppWallets.set(signerPrivateKey, wallet);
  }
  return wallet;
};

// the key address a wallet proof names: the account's signing key, never author.address
export const getAccountKeyAddress = (account: Account | undefined): string | undefined =>
  (typeof account?.signer?.publicKey === 'string' ? getKeyAddressFromPublicKey(account.signer.publicKey) : undefined) ?? account?.signer?.address;

const isSameAddress = (a: unknown, b: unknown): boolean => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

const signInAppWallet = async (account: Account, inAppWallet: InAppWallet): Promise<Wallet> => {
  const keyAddress = getAccountKeyAddress(account);
  if (!keyAddress) {
    throw Error('account has no signing key');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  // stored in the one encoding a proof may have, whatever the signer returned
  const signature = normalizeWalletSignature(await signWalletMessage(inAppWallet.privateKey, getWalletMessageToSign(keyAddress, timestamp)));
  if (!signature) {
    throw Error('the wallet returned a signature that is not 65 bytes');
  }
  return { address: inAppWallet.address, timestamp, signature: { signature, type: walletSignatureType } };
};

// the key the in-app wallet is published under when the account publishes it under none: `eth`,
// or `evm` when the account already publishes another wallet as `eth`
const getInAppWalletKey = (wallets: Record<string, Wallet> | undefined): string => (wallets?.eth ? 'evm' : 'eth');

// whether the account publishes a valid proof of the in-app wallet, under any author.wallets key
export const isInAppWalletProven = async (account: Account | undefined): Promise<boolean> => {
  const inAppWallet = getInAppWallet(account);
  const keyAddress = getAccountKeyAddress(account);
  const wallets: Record<string, Wallet> = account?.author?.wallets ?? {};
  if (!inAppWallet) {
    return false;
  }
  for (const wallet of Object.values(wallets)) {
    if (isSameAddress(wallet?.address, inAppWallet.address) && !(await getWalletProofError(wallet, keyAddress))) {
      return true;
    }
  }
  return false;
};

// A tip's sender must be an address the tipper has proven, and tips are sent from the in-app wallet,
// so this makes sure the account publishes a valid proof of it. Which author.wallets key it sits
// under does not matter. Resolves to the in-app wallet address.
export const ensureInAppWallet = async (account: Account | undefined): Promise<string> => {
  const inAppWallet = getInAppWallet(account);
  if (!account || !inAppWallet) {
    throw Error('this account has no in-app wallet');
  }
  if (await isInAppWalletProven(account)) {
    return inAppWallet.address;
  }
  const wallets: Record<string, Wallet> | undefined = account.author?.wallets;
  // an entry of the in-app wallet whose proof no longer verifies is replaced where it is
  const key = Object.keys(wallets ?? {}).find((key) => isSameAddress(wallets?.[key]?.address, inAppWallet.address)) ?? getInAppWalletKey(wallets);
  if (wallets?.[key] && !isSameAddress(wallets[key].address, inAppWallet.address)) {
    throw Error(`this account already publishes other wallets as eth and evm. Remove one in settings so the in-app wallet ${inAppWallet.address} can be published`);
  }
  const wallet = await signInAppWallet(account, inAppWallet);
  await setAccount({ ...account, author: { ...account.author, wallets: { ...wallets, [key]: wallet } } });
  return inAppWallet.address;
};

// one migration at a time per account, since setAccount replaces the whole account
const migratingAccountIds = new Set<string>();

// Wallet proofs used to be signed over other strings. Every proof of the in-app wallet that no
// longer verifies is signed again here, because the app holds its key. A wallet linked by hand
// can't be signed for, so the wallet settings mark it instead.
export const useWalletProofMigration = (): void => {
  const account = useAccount();
  const accountId: string | undefined = account?.id;
  const wallets: Record<string, Wallet> | undefined = account?.author?.wallets;
  useEffect(() => {
    const inAppWallet = getInAppWallet(account);
    if (!accountId || !wallets || !inAppWallet || migratingAccountIds.has(accountId)) {
      return;
    }
    migratingAccountIds.add(accountId);
    (async () => {
      const keyAddress = getAccountKeyAddress(account);
      const resigned: Record<string, Wallet> = {};
      for (const [key, wallet] of Object.entries(wallets)) {
        if (isSameAddress(wallet?.address, inAppWallet.address) && (await getWalletProofError(wallet, keyAddress))) {
          resigned[key] = await signInAppWallet(account, inAppWallet);
        }
      }
      if (Object.keys(resigned).length) {
        await setAccount({ ...account, author: { ...account.author, wallets: { ...wallets, ...resigned } } });
      }
    })()
      .catch((error) => console.warn('failed re-signing the in-app wallet', error))
      .finally(() => migratingAccountIds.delete(accountId));
    // the account object changes on every store update, its id and wallets are what this depends on
    // eslint-disable-next-line react/exhaustive-deps
  }, [accountId, wallets]);
};
