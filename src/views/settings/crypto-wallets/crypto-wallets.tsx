import { useState } from 'react';
import { useAccount, setAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Account, Wallet } from '@bitsocial/bitsocial-react-hooks';
import { getAccountKeyAddress } from '../../../hooks/use-in-app-wallet';
import { getWalletMessageToSign, getWalletProofError, walletSignatureType } from '../../../lib/tipping';

// the form edits a flat row per chain, while the account stores the signature nested inside a Wallet
interface WalletInput {
  chainTicker?: string;
  address?: string;
  timestamp?: number;
  signature?: string;
}

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
            const messageToSign = getWalletMessageToSign(authorPublicKey, timestamp);

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
    const wallets: Record<string, Wallet> = {};
    for (const wallet of walletsArray) {
      if (!wallet.chainTicker) {
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
      // eip191 is the only proof a community accepts
      const proof: Wallet = { address: wallet.address, timestamp: wallet.timestamp, signature: { signature: wallet.signature, type: walletSignatureType } };
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
