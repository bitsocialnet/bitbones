import { Suspense, use, useState } from 'react';
import { useAccount, useCommunities } from '@bitsocial/bitsocial-react-hooks';
import type { Account } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityIdentifiers } from '../../../hooks/use-community-identifier';
import { ensureInAppWallet, getInAppWallet, isInAppWalletProven } from '../../../hooks/use-in-app-wallet';
import useTippingSettingsStore, { getTippingRpcUrl } from '../../../hooks/use-tipping-settings';
import { formatTokenAmount, getTippingConfig, getTokenKey } from '../../../lib/tipping';
import type { TipToken } from '../../../lib/tipping';
import { ensureRpcChainId, getBalance, getTokenInfo } from '../../../lib/tipping-chain';

interface BalanceRow {
  key: string;
  text: string;
}

interface ChainRpcUrlProps {
  chainId: number;
  accountRpcUrl?: string;
}

const ChainRpcUrl = ({ chainId, accountRpcUrl }: ChainRpcUrlProps) => {
  const rpcUrl = useTippingSettingsStore((state) => state.rpcUrls[chainId]);
  const setRpcUrl = useTippingSettingsStore((state) => state.setRpcUrl);
  const [draft, setDraft] = useState<string>();
  const [check, setCheck] = useState<string>();
  const save = async () => {
    const url = (draft ?? rpcUrl ?? '').trim();
    setRpcUrl(chainId, url);
    if (!url) {
      return setCheck(undefined);
    }
    // saved either way, and refused at send time if it stays on the wrong chain
    setCheck('checking...');
    setCheck(
      await ensureRpcChainId(url, chainId).then(
        () => `reports chain id ${chainId}`,
        (error: Error) => error.message,
      ),
    );
  };
  return (
    <div>
      <label>
        chain id {chainId} RPC url:{' '}
        <input placeholder={accountRpcUrl || 'https://...'} value={draft ?? rpcUrl ?? ''} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button onClick={save}>save</button> {check}
    </div>
  );
};

const provenChecks = new Map<string, Promise<boolean>>();

// the same promise for the same wallets, so the status below can read it during render
const getInAppWalletProven = (account: Account): Promise<boolean> => {
  const key = JSON.stringify([account.signer?.publicKey, account.author?.wallets]);
  let proven = provenChecks.get(key);
  if (!proven) {
    proven = isInAppWalletProven(account).catch(() => false);
    provenChecks.set(key, proven);
  }
  return proven;
};

interface ProofStatusProps {
  account: Account;
}

// a tip's sender must be a wallet the tipper has proven, under any author.wallets key
const ProofStatus = ({ account }: ProofStatusProps) => {
  const proven = use(getInAppWalletProven(account));
  const link = () => ensureInAppWallet(account).catch((error: Error) => alert(error.message));
  if (proven) {
    return <div>published in this account's wallets with a valid proof.</div>;
  }
  return (
    <div>
      not published in this account's wallets with a valid proof, which a tip needs. <button onClick={link}>publish it</button>
    </div>
  );
};

// The wallet tips are sent from: its address to deposit to, the RPC each chain id is reached
// through, and what it holds of the tokens the subscribed communities accept as tips.
const InAppWallet = () => {
  const account = useAccount();
  const inAppWallet = getInAppWallet(account);
  const subscriptions: string[] | undefined = account?.subscriptions;
  const { communities } = useCommunities({ communities: useCommunityIdentifiers(subscriptions) });
  const claimLocation = useTippingSettingsStore((state) => state.claimLocation);
  const setClaimLocation = useTippingSettingsStore((state) => state.setClaimLocation);
  const rpcUrlOverrides = useTippingSettingsStore((state) => state.rpcUrls);
  const [addedChainIds, setAddedChainIds] = useState<number[]>([]);
  const [newChainId, setNewChainId] = useState('');
  const [balances, setBalances] = useState<BalanceRow[]>();
  const [loading, setLoading] = useState(false);

  // every token a subscribed community accepts, once each, plus the coin of each of their chains for gas
  const tokens = new Map<string, TipToken>();
  for (const community of communities) {
    for (const token of getTippingConfig(community)?.tokens ?? []) {
      tokens.set(getTokenKey({ chainId: token.chainId, type: 'native' }), { chainId: token.chainId, type: 'native' });
      tokens.set(getTokenKey(token), token);
    }
  }
  const chainIds = [...new Set([1, ...Object.keys(rpcUrlOverrides).map(Number), ...addedChainIds, ...[...tokens.values()].map((token) => token.chainId)])].sort(
    (a, b) => a - b,
  );

  if (!account || !inAppWallet) {
    return (
      <div>
        <div>in-app wallet:</div>
        <div>this account has no signing key to derive a wallet from</div>
      </div>
    );
  }

  const loadBalances = async () => {
    setLoading(true);
    try {
      const rows = await Promise.all(
        [...tokens.values()].map(async (token): Promise<BalanceRow> => {
          const key = getTokenKey(token);
          const label = `chain id ${token.chainId} ${token.type} ${token.address ?? ''}`;
          const rpcUrl = getTippingRpcUrl(token.chainId, account.chainProviders);
          if (!rpcUrl) {
            return { key, text: `${label}: no RPC url` };
          }
          try {
            // a balance read from another chain would be a balance of something else
            await ensureRpcChainId(rpcUrl, token.chainId);
            const [{ symbol, decimals }, balance] = await Promise.all([getTokenInfo(rpcUrl, token), getBalance(rpcUrl, token, inAppWallet.address)]);
            const amount = decimals === undefined ? `${balance} base units of` : formatTokenAmount(balance, decimals);
            return { key, text: `${amount} ${symbol} (chain id ${token.chainId}${token.address ? `, ${token.address}` : ''})` };
          } catch (error) {
            return { key, text: `${label}: ${(error as Error).message}` };
          }
        }),
      );
      setBalances(rows);
    } finally {
      setLoading(false);
    }
  };

  const addChainId = () => {
    const chainId = Number(newChainId.trim());
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      return alert('a chain id is a positive integer, e.g. 1 or 11155111');
    }
    setAddedChainIds([...addedChainIds, chainId]);
    setNewChainId('');
  };

  return (
    <div>
      <div>in-app wallet (tips are sent from it, deposit to it):</div>
      <div>
        <input aria-label='In-app wallet address' readOnly value={inAppWallet.address} size={44} />
        <button onClick={() => navigator.clipboard.writeText(inAppWallet.address)}>copy</button>
      </div>
      <div>its key is this account's key, kept in this browser: deposit only what you mean to tip, plus the chain's coin for gas.</div>
      <Suspense fallback={<div>checking its proof...</div>}>
        <ProofStatus account={account} />
      </Suspense>
      {chainIds.map((chainId) => (
        <ChainRpcUrl key={chainId} chainId={chainId} accountRpcUrl={getTippingRpcUrl(chainId, account.chainProviders)} />
      ))}
      <div>
        <input aria-label='Chain id' placeholder='chain id e.g. 11155111' value={newChainId} onChange={(event) => setNewChainId(event.target.value)} />
        <button onClick={addChainId}>add a chain</button>
      </div>
      <div>
        <button disabled={loading || !tokens.size} onClick={loadBalances}>
          {loading ? 'loading...' : 'load balances'}
        </button>{' '}
        {!tokens.size && 'none of the subscribed communities publishes tipping options'}
      </div>
      {balances?.map(({ key, text }) => (
        <div key={key}>{text}</div>
      ))}
      <div>
        <label>
          tip claim location:{' '}
          <select value={claimLocation} onChange={(event) => setClaimLocation(event.target.value === 'comment' ? 'comment' : 'author')}>
            <option value='author'>author.tip (publishes with the installed pkc-js)</option>
            <option value='comment'>comment.tip (tipping/v1, rejected by the installed pkc-js)</option>
          </select>
        </label>
      </div>
    </div>
  );
};

export default InAppWallet;
