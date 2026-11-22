import { Suspense, use, useState } from 'react';
import { useAccount, setAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Account, Wallet } from '@bitsocial/bitsocial-react-hooks';
import { getAccountKeyAddress } from '../../../hooks/use-in-app-wallet';
import { getWalletMessageToSign, getWalletProofError, getWalletProofResult, normalizeWalletSignature, walletSignatureType } from '../../../lib/tipping';

// the form edits a flat row per chain, while the account stores the signature nested inside a Wallet
interface WalletInput {
  chainTicker?: string;
  address?: string;
  timestamp?: number;
  signature?: string;
}

interface SavedWalletStatusProps {
  wallet: Wallet | undefined;
  authorPublicKey: string | undefined;
}

// The outcome of an entry the account already stores, with the reason, so a proof signed the way
// older clients did shows up as needing a new signature instead of failing silently elsewhere.
const LoadedSavedWalletStatus = ({ wallet, authorPublicKey }: SavedWalletStatusProps) => {
  const { outcome, reason } = use(getWalletProofResult(wallet, authorPublicKey));
  if (outcome === 'valid') {
    return <div>saved proof: valid</div>;
  }
  return (
    <div>
      saved proof: {outcome} ({reason}), unproven: not shown as your wallet and not used.
      {outcome === 'invalid' && ' click "copy message to sign", sign it again and save.'}
    </div>
  );
};

const SavedWalletStatus = (props: SavedWalletStatusProps) =>
  props.wallet ? (
    <Suspense fallback={<div>saved proof: verifying...</div>}>
      <LoadedSavedWalletStatus {...props} />
    </Suspense>
  ) : null;

interface CryptoWalletsFormProps {
  account?: Account;
}

const CryptoWalletsForm = ({ account }: CryptoWalletsFormProps) => {
  // force account to be defined to be able to use account as default values
  if (!account) {
    throw Error('CryptoWalletsForm account prop must be defined');
  }
  // a wallet proof names the account's signing key, never author.address, which may be a name
  const authorPublicKey = getAccountKeyAddress(account);
  const defaultWalletsArray: WalletInput[] = Object.keys(account?.author?.wallets || {}).map((chainTicker) => ({
    chainTicker,
    address: account?.author?.wallets?.[chainTicker]?.address,
    timestamp: account?.author?.wallets?.[chainTicker]?.timestamp,
    signature: account?.author?.wallets?.[chainTicker]?.signature?.signature,
  }));
  if (!defaultWalletsArray.length) {
    defaultWalletsArray.push({});
  }
  const [walletsArray, setWalletsArray] = useState(defaultWalletsArray);
  // The rows the form started with: the only entries a save may remove. An entry added elsewhere after
  // the form mounted, such as the in-app wallet's, is not in the form and must survive a save.
  const [initialChainTickers] = useState(() =>
    defaultWalletsArray.map((wallet) => wallet.chainTicker).filter((chainTicker): chainTicker is string => Boolean(chainTicker)),
  );
  const setWalletsArrayProperty = (index: number, property: keyof WalletInput, value: string | number) => {
    const newArray = [...walletsArray];
    newArray[index] = { ...newArray[index], [property]: value };
    setWalletsArray(newArray);
  };

  const walletsInputs = walletsArray.map((wallet, index) => {
    const blockExplorerUrl = wallet.chainTicker === 'sol' ? 'https://solscan.io/verifiedsignatures' : 'https://etherscan.io/verifiedSignatures';
    return (
      <div>
        <input onChange={(e) => setWalletsArrayProperty(index, 'chainTicker', e.target.value)} value={wallet.chainTicker} placeholder='chain ticker e.g. eth, matic...' />
        <input onChange={(e) => setWalletsArrayProperty(index, 'address', e.target.value)} value={wallet.address} placeholder='wallet address e.g. 0x...' />
        <button
          onClick={() => {
            if (!wallet.chainTicker) {
              return alert('missing chain ticker');
            }
            if (!wallet.address) {
              return alert('missing address');
            }
            if (!authorPublicKey) {
              return alert('account has no signing key');
            }
            // always a new timestamp: a saved one may belong to a proof signed over an older message
            const timestamp = Math.floor(Date.now() / 1000);
            const messageToSign = getWalletMessageToSign(authorPublicKey, wallet.address.trim(), timestamp);

            // if timestamp changed, update it so it gets saved properly
            if (timestamp !== wallet.timestamp) {
              setWalletsArrayProperty(index, 'timestamp', timestamp);
            }

            navigator.clipboard.writeText(messageToSign);
            alert(messageToSign);
          }}
        >
          copy message to sign
        </button>
        <input onChange={(e) => setWalletsArrayProperty(index, 'signature', e.target.value)} value={wallet.signature} placeholder='signature e.g. 0x...' />
        <SavedWalletStatus wallet={wallet.chainTicker ? account.author?.wallets?.[wallet.chainTicker] : undefined} authorPublicKey={authorPublicKey} />
        <div>
          go to{' '}
          <a href={blockExplorerUrl} target='_blank' rel='noreferrer'>
            {blockExplorerUrl}
          </a>{' '}
          and sign, then paste signature
        </div>
      </div>
    );
  });

  const save = async () => {
    // start from the entries the account stores now, and change only what the rows say
    const savedWallets = account.author?.wallets || {};
    const wallets: Record<string, Wallet> = { ...savedWallets };
    const rowChainTickers = new Set(walletsArray.map((wallet) => wallet.chainTicker).filter(Boolean));
    for (const chainTicker of initialChainTickers) {
      if (!rowChainTickers.has(chainTicker)) {
        delete wallets[chainTicker];
      }
    }
    for (const wallet of walletsArray) {
      if (!wallet.chainTicker) {
        continue;
      }
      const savedWallet = savedWallets[wallet.chainTicker];
      // a row left as it was keeps its entry, whatever its proof is: one that fails shows in its status and is not a reason to refuse the others
      if (
        savedWallet &&
        savedWallet.address === wallet.address?.trim() &&
        savedWallet.timestamp === wallet.timestamp &&
        savedWallet.signature?.signature === wallet.signature?.trim()
      ) {
        continue;
      }
      if (!wallet.address) {
        return alert(`${wallet.chainTicker} missing address`);
      }
      if (!wallet.signature) {
        return alert(`${wallet.chainTicker} missing signature`);
      }
      if (!wallet.timestamp) {
        return alert(`${wallet.chainTicker} missing timestamp, must click "copy message to sign" again and resign`);
      }
      // a wallet linked with another signature type, such as a sol one, is not verified here: it keeps its type
      // a new sol row has no saved entry, so its type comes from the ticker, as the solscan link does. A saved
      // entry keeps its own type, even eip191 under a sol ticker.
      const otherType =
        savedWallet?.signature?.type && savedWallet.signature.type !== walletSignatureType
          ? savedWallet.signature.type
          : !savedWallet && wallet.chainTicker === 'sol'
            ? 'sol'
            : undefined;
      if (otherType) {
        wallets[wallet.chainTicker] = {
          address: wallet.address.trim(),
          timestamp: wallet.timestamp,
          signature: { signature: wallet.signature.trim(), type: otherType },
        };
        continue;
      }
      // eip191 is the only proof a community accepts
      // a pasted signature may have v as 0 or 1, or a high s: store it in the one encoding a proof may have
      const signature = normalizeWalletSignature(wallet.signature.trim()) ?? wallet.signature.trim();
      const proof: Wallet = { address: wallet.address.trim(), timestamp: wallet.timestamp, signature: { signature, type: walletSignatureType } };
      const proofError = await getWalletProofError(proof, authorPublicKey);
      if (proofError) {
        return alert(`${wallet.chainTicker}: ${proofError}. click "copy message to sign", sign that message with the wallet, and paste the new signature`);
      }
      wallets[wallet.chainTicker] = proof;
    }
    setAccount({ ...account, author: { ...account?.author, wallets } });
    alert(`saved`);
  };

  return (
    <>
      {walletsInputs}
      <button onClick={() => setWalletsArray([...walletsArray, {}])}>+add</button>
      <button onClick={save}>save</button>
    </>
  );
};

const CryptoWallets = () => {
  const account = useAccount();
  if (!account) {
    return (
      <div>
        <div>wallets:</div>
      </div>
    );
  }
  return (
    <div>
      <div>wallets:</div>
      {/* remount per account, the form state is seeded from the account it first rendered */}
      <CryptoWalletsForm key={account.id} account={account} />
    </div>
  );
};

export default CryptoWallets;
