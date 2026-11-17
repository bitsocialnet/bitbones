import { setAccount, useAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Account, Wallet } from '@bitsocial/bitsocial-react-hooks';
import { useEffect } from 'react';
import type { Hex } from 'viem';
import { getEthPrivateKeyFromSignerPrivateKey, getKeyAddressFromPublicKey, getWalletMessageToSign, getWalletProofError, walletSignatureType } from '../lib/tipping';
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
  const signature = await signWalletMessage(inAppWallet.privateKey, getWalletMessageToSign(keyAddress, timestamp));
  return { address: inAppWallet.address, timestamp, signature: { signature, type: walletSignatureType } };
};

// Links the in-app wallet to the account under a chain ticker, unless a valid proof of it is
// already there. Resolves to the wallet address the account now publishes for that chain. Throws
// when the account publishes another wallet for the chain: only the in-app wallet can send a tip,
// and the tip's sender must be the wallet the tipper publishes.
export const ensureInAppWallet = async (account: Account | undefined, chainTicker: string): Promise<string> => {
  const inAppWallet = getInAppWallet(account);
  if (!account || !inAppWallet) {
    throw Error('this account has no in-app wallet');
  }
  const current = account.author?.wallets?.[chainTicker];
  if (current && !isSameAddress(current.address, inAppWallet.address)) {
    throw Error(
      `this account publishes another ${chainTicker} wallet (${current.address}). Tips are sent from the in-app wallet ${inAppWallet.address}, so replace it in settings first`,
    );
  }
  if (current && !(await getWalletProofError(current, getAccountKeyAddress(account)))) {
    return inAppWallet.address;
  }
  const wallet = await signInAppWallet(account, inAppWallet);
  await setAccount({ ...account, author: { ...account.author, wallets: { ...account.author?.wallets, [chainTicker]: wallet } } });
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
      for (const [chainTicker, wallet] of Object.entries(wallets)) {
        if (isSameAddress(wallet?.address, inAppWallet.address) && (await getWalletProofError(wallet, keyAddress))) {
          resigned[chainTicker] = await signInAppWallet(account, inAppWallet);
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
