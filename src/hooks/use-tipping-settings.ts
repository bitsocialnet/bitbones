import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { create } from 'zustand';
import type { TipClaimLocation } from '../lib/tipping';

const STORAGE_KEY = 'bitbonesTipping';

interface StoredTippingSettings {
  // The RPC url tips are sent and read through, per chain id (as a string, the way JSON keys are).
  // A chain is tried without real funds by tipping a token on a testnet chain id and setting that
  // chain's RPC here. An RPC that reports another chain id than its key is refused before any send.
  rpcUrls: Record<string, string>;
  claimLocation: TipClaimLocation;
}

const defaultSettings: StoredTippingSettings = { rpcUrls: {}, claimLocation: 'author' };

const readStoredSettings = (): StoredTippingSettings => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const rpcUrls: Record<string, string> = {};
    // urls saved under anything but a chain id, such as a chain ticker, name no chain and are dropped
    for (const [key, url] of Object.entries(stored?.rpcUrls && typeof stored.rpcUrls === 'object' ? stored.rpcUrls : {})) {
      if (/^[1-9]\d*$/.test(key) && typeof url === 'string') {
        rpcUrls[key] = url;
      }
    }
    return { rpcUrls, claimLocation: stored?.claimLocation === 'comment' ? 'comment' : 'author' };
  } catch {
    return defaultSettings;
  }
};

interface TippingSettingsState extends StoredTippingSettings {
  setRpcUrl: (chainId: number, rpcUrl: string) => void;
  setClaimLocation: (claimLocation: TipClaimLocation) => void;
}

const save = ({ rpcUrls, claimLocation }: StoredTippingSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rpcUrls, claimLocation }));
  } catch {}
};

const useTippingSettingsStore = create<TippingSettingsState>((setState, getState) => ({
  ...readStoredSettings(),
  setRpcUrl: (chainId, rpcUrl) => {
    const rpcUrls = { ...getState().rpcUrls };
    if (rpcUrl.trim()) {
      rpcUrls[chainId] = rpcUrl.trim();
    } else {
      delete rpcUrls[chainId];
    }
    setState({ rpcUrls });
    save(getState());
  },
  setClaimLocation: (claimLocation) => {
    setState({ claimLocation });
    save(getState());
  },
}));

type ChainProviders = Record<string, { urls?: unknown; chainId?: unknown } | undefined> | undefined;

// The account's own provider for a chain id, whatever ticker it is listed under. Its urls also list
// non-url entries such as 'ethers.js'.
const getAccountRpcUrl = (chainId: number, chainProviders: ChainProviders): string | undefined => {
  for (const provider of Object.values(chainProviders ?? {})) {
    if (provider?.chainId === chainId && Array.isArray(provider.urls)) {
      const url: unknown = provider.urls.find((url) => typeof url === 'string' && /^https?:\/\//.test(url));
      if (typeof url === 'string') {
        return url;
      }
    }
  }
  return undefined;
};

// the RPC url for a chain id: the one set for tipping, otherwise the account's own provider of that chain
export const getTippingRpcUrl = (chainId: number | undefined, chainProviders: ChainProviders): string | undefined =>
  chainId === undefined ? undefined : useTippingSettingsStore.getState().rpcUrls[chainId] || getAccountRpcUrl(chainId, chainProviders);

export const useTippingRpcUrl = (chainId: number | undefined): string | undefined => {
  const chainProviders: ChainProviders = useAccount()?.chainProviders;
  const rpcUrlOverride = useTippingSettingsStore((state) => (chainId === undefined ? undefined : state.rpcUrls[chainId]));
  return chainId === undefined ? undefined : rpcUrlOverride || getAccountRpcUrl(chainId, chainProviders);
};

export default useTippingSettingsStore;
