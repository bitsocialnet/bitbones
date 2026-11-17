import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { create } from 'zustand';
import type { TipClaimLocation } from '../lib/tipping';

const STORAGE_KEY = 'bitbonesTipping';

interface StoredTippingSettings {
  // the RPC url tips are sent and read through, per chain ticker. Pointing 'eth' at a testnet RPC
  // is how tipping is tried without real funds: the chain is whatever the RPC serves.
  rpcUrls: Record<string, string>;
  claimLocation: TipClaimLocation;
}

const defaultSettings: StoredTippingSettings = { rpcUrls: {}, claimLocation: 'author' };

const readStoredSettings = (): StoredTippingSettings => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      rpcUrls: stored?.rpcUrls && typeof stored.rpcUrls === 'object' ? stored.rpcUrls : {},
      claimLocation: stored?.claimLocation === 'comment' ? 'comment' : 'author',
    };
  } catch {
    return defaultSettings;
  }
};

interface TippingSettingsState extends StoredTippingSettings {
  setRpcUrl: (chainTicker: string, rpcUrl: string) => void;
  setClaimLocation: (claimLocation: TipClaimLocation) => void;
}

const save = ({ rpcUrls, claimLocation }: StoredTippingSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rpcUrls, claimLocation }));
  } catch {}
};

const useTippingSettingsStore = create<TippingSettingsState>((setState, getState) => ({
  ...readStoredSettings(),
  setRpcUrl: (chainTicker, rpcUrl) => {
    const rpcUrls = { ...getState().rpcUrls };
    if (rpcUrl.trim()) {
      rpcUrls[chainTicker] = rpcUrl.trim();
    } else {
      delete rpcUrls[chainTicker];
    }
    setState({ rpcUrls });
    save(getState());
  },
  setClaimLocation: (claimLocation) => {
    setState({ claimLocation });
    save(getState());
  },
}));

// the account's chain providers also list non-url entries such as 'ethers.js'
const getAccountRpcUrl = (urls: unknown): string | undefined =>
  Array.isArray(urls) ? urls.find((url) => typeof url === 'string' && /^https?:\/\//.test(url)) : undefined;

// the RPC url for a chain ticker: the one set for tipping, otherwise the account's own provider
export const getTippingRpcUrl = (chainTicker: string | undefined, chainProviders: Record<string, { urls?: unknown } | undefined> | undefined): string | undefined =>
  chainTicker ? useTippingSettingsStore.getState().rpcUrls[chainTicker] || getAccountRpcUrl(chainProviders?.[chainTicker]?.urls) : undefined;

export const useTippingRpcUrl = (chainTicker: string | undefined): string | undefined => {
  const chainProviders = useAccount()?.chainProviders;
  const rpcUrlOverride = useTippingSettingsStore((state) => (chainTicker ? state.rpcUrls[chainTicker] : undefined));
  return chainTicker ? rpcUrlOverride || getAccountRpcUrl(chainProviders?.[chainTicker]?.urls) : undefined;
};

export default useTippingSettingsStore;
