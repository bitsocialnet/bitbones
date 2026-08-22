import { BsoResolver } from '@bitsocial/bso-resolver';

const DEFAULT_ETH_RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
  'https://ethereum.publicnode.com',
  'https://rpc.mevblocker.io',
  'https://1rpc.io/eth',
  'https://eth-pokt.nodies.app',
];

const getProviderLabel = (provider) => {
  try {
    return new URL(provider).hostname;
  } catch {
    return provider;
  }
};

// .bso names are resolved onchain, so the desktop node needs at least one eth rpc
const createBsoNameResolvers = (providers = DEFAULT_ETH_RPC_URLS) => providers.map((provider) => new BsoResolver({ key: `eth-${getProviderLabel(provider)}`, provider }));

export const createDefaultPkcOptions = ({ dataPath }) => ({
  dataPath,
  kuboRpcClientsOptions: [{ url: 'http://localhost:50019/api/v0' }],
  httpRoutersOptions: ['https://routing.lol', 'https://peers.pleb.bot', 'https://peers.plebpubsub.xyz', 'https://peers.forumindex.com'],
  nameResolvers: createBsoNameResolvers(),
});
