import { useState } from 'react';
import { useAccount, useCommunities } from '@bitsocial/bitsocial-react-hooks';
import type { Wallet } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityIdentifiers } from '../../../hooks/use-community-identifier';
import { ensureInAppWallet, getInAppWallet } from '../../../hooks/use-in-app-wallet';
import useTippingSettingsStore, { getTippingRpcUrl } from '../../../hooks/use-tipping-settings';
import { formatTokenAmount, getTippingConfig, getTokenKey } from '../../../lib/tipping';
import type { TipToken } from '../../../lib/tipping';
import { getBalance, getChainId, getTokenInfo } from '../../../lib/tipping-chain';

interface BalanceRow {
  key: string;
  text: string;
}

interface ChainRpcUrlProps {
  chainTicker: string;
  accountRpcUrl?: string;
}

const ChainRpcUrl = ({ chainTicker, accountRpcUrl }: ChainRpcUrlProps) => {
  const rpcUrl = useTippingSettingsStore((state) => state.rpcUrls[chainTicker]);
  const setRpcUrl = useTippingSettingsStore((state) => state.setRpcUrl);
  const [draft, setDraft] = useState<string>();
  return (
    <div>
      <label>
        {chainTicker} RPC url: <input placeholder={accountRpcUrl || 'https://...'} value={draft ?? rpcUrl ?? ''} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button onClick={() => setRpcUrl(chainTicker, draft ?? rpcUrl ?? '')}>save</button>
    </div>
  );
};

// The wallet tips are sent from: its address to deposit to, the RPC each chain is reached through,
// and what it holds of the tokens the subscribed communities accept as tips.
const InAppWallet = () => {
  const account = useAccount();
  const inAppWallet = getInAppWallet(account);
  const subscriptions: string[] | undefined = account?.subscriptions;
  const { communities } = useCommunities({ communities: useCommunityIdentifiers(subscriptions) });
  const claimLocation = useTippingSettingsStore((state) => state.claimLocation);
  const setClaimLocation = useTippingSettingsStore((state) => state.setClaimLocation);
  const [newChainTicker, setNewChainTicker] = useState('');
  const [balances, setBalances] = useState<BalanceRow[]>();
  const [loading, setLoading] = useState(false);

  // every token a subscribed community accepts, once each, plus the native coin of each of their chains for gas
  const tokens = new Map<string, TipToken>();
  for (const community of communities) {
    for (const token of getTippingConfig(community)?.tokens ?? []) {
      tokens.set(getTokenKey({ chainTicker: token.chainTicker, type: 'native' }), { chainTicker: token.chainTicker, type: 'native' });
      tokens.set(getTokenKey(token), token);
    }
  }
  const wallets: Record<string, Wallet | undefined> = account?.author?.wallets ?? {};
  const rpcUrlOverrides = useTippingSettingsStore((state) => state.rpcUrls);
  const chainTickers = [...new Set(['eth', ...Object.keys(wallets), ...Object.keys(rpcUrlOverrides), ...[...tokens.values()].map((token) => token.chainTicker)])];

  if (!inAppWallet) {
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
          const rpcUrl = getTippingRpcUrl(token.chainTicker, account?.chainProviders);
          if (!rpcUrl) {
            return { key, text: `${token.chainTicker} ${token.type} ${token.address ?? ''}: no RPC url` };
          }
          try {
            const [chainId, { symbol, decimals }, balance] = await Promise.all([
              getChainId(rpcUrl),
              getTokenInfo(rpcUrl, token),
              getBalance(rpcUrl, token, inAppWallet.address),
            ]);
            const amount = decimals === undefined ? `${balance} base units of` : formatTokenAmount(balance, decimals);
            return { key, text: `${amount} ${symbol} (${token.chainTicker}, chain id ${chainId}${token.address ? `, ${token.address}` : ''})` };
          } catch (error) {
            return { key, text: `${token.chainTicker} ${token.type} ${token.address ?? ''}: ${(error as Error).message}` };
          }
        }),
      );
      setBalances(rows);
    } finally {
      setLoading(false);
    }
  };

  const link = async (chainTicker: string) => {
    try {
      await ensureInAppWallet(account, chainTicker);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  return (
    <div>
      <div>in-app wallet (tips are sent from it, deposit to it):</div>
      <div>
        <input aria-label='In-app wallet address' readOnly value={inAppWallet.address} size={44} />
        <button onClick={() => navigator.clipboard.writeText(inAppWallet.address)}>copy</button>
      </div>
      <div>its key is this account's key, kept in this browser: deposit only what you mean to tip, plus the chain's coin for gas.</div>
      {chainTickers.map((chainTicker) => (
        <div key={chainTicker}>
          <ChainRpcUrl chainTicker={chainTicker} accountRpcUrl={getTippingRpcUrl(chainTicker, account?.chainProviders)} />
          {wallets[chainTicker]?.address?.toLowerCase?.() !== inAppWallet.address.toLowerCase() && (
            <div>
              {wallets[chainTicker]
                ? `this account publishes another ${chainTicker} wallet, so it can't tip on ${chainTicker}`
                : `not linked to this account on ${chainTicker}`}{' '}
              {!wallets[chainTicker] && <button onClick={() => link(chainTicker)}>link</button>}
            </div>
          )}
        </div>
      ))}
      <div>
        <input
          aria-label='Chain ticker'
          placeholder='chain ticker e.g. eth, matic...'
          value={newChainTicker}
          onChange={(event) => setNewChainTicker(event.target.value)}
        />
        <button onClick={() => newChainTicker.trim() && link(newChainTicker.trim()).then(() => setNewChainTicker(''))}>link the in-app wallet to this chain</button>
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
