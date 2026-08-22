// Loads the default community list for either client from bitsocialnet/lists.
//
// Every source has its own cache slot, which is the whole point: the feed can switch between
// clients, so a single shared cache would pin whichever list resolved first.
//
// Layering, per source: in-memory cache -> localStorage (1h TTL) -> vendored build-time mirror,
// with a background refresh from GitHub. The vendored mirror means bitbones still has a feed
// offline; without it a failed fetch leaves every feed view showing 'loading...' forever.

import vendoredSeedit from '../data/vendored-seedit-defaults.json';
import vendored5chan from '../data/vendored-5chan-defaults.json';

const RAW_BASE = 'https://raw.githubusercontent.com/bitsocialnet/lists/master';
const SEEDIT_URL = `${RAW_BASE}/seedit-default-subscriptions.json`;
const FIVECHAN_DEFAULTS_URL = `${RAW_BASE}/5chan-directories/5chan-directories-defaults.json`;
const fiveChanDirectoryUrl = (code) => `${RAW_BASE}/5chan-directories/5chan-${code}-directory.json`;

const FETCH_TIMEOUT_MS = 10000;
// how long a successful refresh is trusted before going back to GitHub
const CACHE_MAX_AGE_MS = 60 * 60 * 1000;
// how long to wait after a failure before retrying, so a flaky network can't hammer GitHub on every mount
const FETCH_RETRY_DELAY_MS = 60 * 1000;
// bumped whenever the cached shape changes, so old blobs are never parsed
const CACHE_VERSION = 'v1';

// 5chan hides the trash board from its visible directory list (src/lib/special-boards.ts)
const EXCLUDED_DIRECTORY_CODES = new Set(['trash']);
const EXCLUDED_ADDRESSES = new Set(['off-topic.bso']);

const vendored = { seedit: vendoredSeedit.communities, '5chan': vendored5chan.communities };

const caches = new Map();
const pending = new Map();
const lastFailedAt = new Map();

const storageKey = (source) => `bitbonesDefaultList:${CACHE_VERSION}:${source}`;

const isValidList = (communities) => Array.isArray(communities) && communities.length > 0 && communities.every((community) => typeof community?.address === 'string');

const readStorage = (source) => {
  try {
    const raw = localStorage.getItem(storageKey(source));
    if (!raw) {
      return undefined;
    }
    const { communities, timestamp } = JSON.parse(raw);
    if (!isValidList(communities)) {
      localStorage.removeItem(storageKey(source));
      return undefined;
    }
    return { communities, timestamp };
  } catch (e) {
    return undefined;
  }
};

const writeStorage = (source, communities) => {
  try {
    localStorage.setItem(storageKey(source), JSON.stringify({ communities, timestamp: Date.now() }));
  } catch (e) {
    console.warn(e);
  }
};

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

// one request: this file already stores resolved addresses, so no winner selection is needed
const fetchSeedit = async () => {
  const list = await fetchJson(SEEDIT_URL);
  const communities = (Array.isArray(list?.communities) ? list.communities : [])
    .filter((community) => typeof community?.address === 'string')
    .map((community) => ({ address: community.address, title: community.title }));
  // unlike seedit itself, bitbones does not police the list's `revision` for monotonicity. seedit
  // needs that because it writes these addresses into real account subscriptions; bitbones only
  // builds a transient read-only feed, and refusing a legitimate edit would strand it on the mirror.
  return communities;
};

// same ranking 5chan uses (src/lib/utils/directory-list-utils.ts): score desc, addedAt asc, address
const pickDirectoryWinner = (boards) =>
  [...boards].sort((a, b) => {
    const scoreDifference = (b?.score ?? 0) - (a?.score ?? 0);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }
    const addedAtDifference = (a?.addedAt ?? Number.MAX_SAFE_INTEGER) - (b?.addedAt ?? Number.MAX_SAFE_INTEGER);
    if (addedAtDifference !== 0) {
      return addedAtDifference;
    }
    return String(a?.address ?? '').localeCompare(String(b?.address ?? ''));
  })[0];

// 5chan keeps no aggregated defaults file: the codes come from the defaults file and the addresses
// from one candidate file per code, so a full refresh is ~65 requests. That is why it only ever runs
// in the background, behind the 1h TTL, against the vendored mirror.
const fetch5chan = async () => {
  const defaults = await fetchJson(FIVECHAN_DEFAULTS_URL);
  const codes = Object.keys(defaults?.directories ?? {}).filter((code) => !EXCLUDED_DIRECTORY_CODES.has(code));
  const vendoredByCode = new Map(vendored['5chan'].map((community) => [community.directoryCode, community]));

  const entries = await Promise.all(
    codes.map(async (code) => {
      try {
        const directory = await fetchJson(fiveChanDirectoryUrl(code));
        const winner = pickDirectoryWinner(Array.isArray(directory?.boards) ? directory.boards : []);
        if (!winner?.address) {
          return vendoredByCode.get(code);
        }
        return { address: winner.address, title: defaults.directories[code]?.title, directoryCode: code };
      } catch (e) {
        // a code can be listed before its candidate file is merged; fall back rather than rejecting the batch
        return vendoredByCode.get(code);
      }
    }),
  );

  return entries.filter((community) => community?.address && !EXCLUDED_ADDRESSES.has(community.address));
};

const fetchers = { seedit: fetchSeedit, '5chan': fetch5chan };

// the instant, synchronous value for a source: memory, then localStorage, then the vendored mirror
export const getCachedDefaultList = (source) => {
  const cached = caches.get(source);
  if (cached) {
    return cached;
  }
  const stored = readStorage(source);
  if (stored) {
    caches.set(source, stored.communities);
    return stored.communities;
  }
  return vendored[source] || [];
};

const isFresh = (source) => {
  const stored = readStorage(source);
  return !!stored && Date.now() - stored.timestamp < CACHE_MAX_AGE_MS;
};

// resolves with {source, communities} so callers can drop a response that lost a toggle race
export const getDefaultList = async (source) => {
  if (!fetchers[source]) {
    return { source, communities: [] };
  }
  if (isFresh(source)) {
    return { source, communities: getCachedDefaultList(source) };
  }
  const failedAt = lastFailedAt.get(source);
  if (failedAt && Date.now() - failedAt < FETCH_RETRY_DELAY_MS) {
    return { source, communities: getCachedDefaultList(source) };
  }
  if (!pending.has(source)) {
    const promise = fetchers[source]()
      .then((communities) => {
        if (!isValidList(communities)) {
          throw new Error(`${source} default list resolved to nothing`);
        }
        caches.set(source, communities);
        lastFailedAt.delete(source);
        writeStorage(source, communities);
        return communities;
      })
      .catch((e) => {
        lastFailedAt.set(source, Date.now());
        throw e;
      })
      .finally(() => pending.delete(source));
    pending.set(source, promise);
  }
  return { source, communities: await pending.get(source) };
};
