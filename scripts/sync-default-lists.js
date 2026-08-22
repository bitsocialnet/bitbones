// Best-effort mirror of the default community lists from bitsocialnet/lists.
//
// Writes two flat, already-resolved files into src/data/ so bitbones has an instant, offline-safe
// value for both clients on first paint:
//   src/data/vendored-seedit-defaults.json  <- seedit-default-subscriptions.json
//   src/data/vendored-5chan-defaults.json   <- 5chan-directories/, one winner per directory code
//
// Never fails the build: if any fetch fails (offline, rate-limited, GitHub down) the existing
// vendored files are kept as-is.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data');
const RAW_BASE = 'https://raw.githubusercontent.com/bitsocialnet/lists/master';
const SEEDIT_URL = `${RAW_BASE}/seedit-default-subscriptions.json`;
const FIVECHAN_DEFAULTS_URL = `${RAW_BASE}/5chan-directories/5chan-directories-defaults.json`;
const fiveChanDirectoryUrl = (code) => `${RAW_BASE}/5chan-directories/5chan-${code}-directory.json`;
const TIMEOUT_MS = 10000;

// 5chan hides the trash board from its visible directory list (src/lib/special-boards.ts)
const EXCLUDED_DIRECTORY_CODES = new Set(['trash']);
const EXCLUDED_ADDRESSES = new Set(['off-topic.bso']);

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

// Same ranking 5chan uses to resolve a directory code to a single board
// (src/lib/utils/directory-list-utils.ts): highest score wins, then oldest entry, then address.
// 5chan additionally prefers boards owned by known 5chan developers as a tie-break; bitbones skips
// that because it would need a copy of known-5chan-developers.json and it is a no-op on today's
// data, where every contested code is already separated by `score`.
const pickDirectoryWinner = (boards) => {
  const ranked = [...boards].sort((a, b) => {
    const scoreDifference = (b?.score ?? 0) - (a?.score ?? 0);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }
    const addedAtDifference = (a?.addedAt ?? Number.MAX_SAFE_INTEGER) - (b?.addedAt ?? Number.MAX_SAFE_INTEGER);
    if (addedAtDifference !== 0) {
      return addedAtDifference;
    }
    return String(a?.address ?? '').localeCompare(String(b?.address ?? ''));
  });
  return ranked[0];
};

const loadSeeditDefaults = async () => {
  const list = await fetchJson(SEEDIT_URL);
  if (!Array.isArray(list?.communities)) {
    throw new Error('seedit list has no communities array');
  }
  const communities = list.communities
    .filter((community) => typeof community?.address === 'string' && community.address.includes('.'))
    .map((community) => ({ address: community.address, title: community.title }));
  if (communities.length === 0) {
    throw new Error('seedit list resolved to zero communities');
  }
  return { source: 'seedit', revision: list.revision ?? null, communities };
};

const load5chanDefaults = async () => {
  const defaults = await fetchJson(FIVECHAN_DEFAULTS_URL);
  const codes = Object.keys(defaults?.directories ?? {}).filter((code) => !EXCLUDED_DIRECTORY_CODES.has(code));
  if (codes.length === 0) {
    throw new Error('5chan defaults file has no directory codes');
  }

  const entries = await Promise.all(
    codes.map(async (code) => {
      try {
        const directory = await fetchJson(fiveChanDirectoryUrl(code));
        const winner = pickDirectoryWinner(Array.isArray(directory?.boards) ? directory.boards : []);
        if (!winner?.address || EXCLUDED_ADDRESSES.has(winner.address)) {
          return undefined;
        }
        // the human-readable title lives in the defaults file, not in the candidate file
        return { address: winner.address, title: defaults.directories[code]?.title, directoryCode: code };
      } catch (error) {
        // a code can be listed before its candidate file is merged; skip it rather than failing the batch
        console.warn(`ℹ️  skipping 5chan directory '${code}': ${error.message}`);
        return undefined;
      }
    }),
  );

  const communities = entries.filter(Boolean);
  if (communities.length === 0) {
    throw new Error('5chan directories resolved to zero communities');
  }
  return { source: '5chan', revision: defaults.updatedAt ?? null, communities };
};

const writeIfChanged = (fileName, value) => {
  const filePath = join(OUTPUT_DIR, fileName);
  const text = JSON.stringify(value, undefined, 2) + '\n';
  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === text) {
    console.log(`✅ ${fileName} already up to date (${value.communities.length} communities)`);
    return;
  }
  writeFileSync(filePath, text);
  console.log(`✅ wrote ${fileName} (${value.communities.length} communities)`);
};

const sync = async (fileName, load) => {
  try {
    writeIfChanged(fileName, await load());
  } catch (error) {
    const filePath = join(OUTPUT_DIR, fileName);
    if (existsSync(filePath)) {
      console.warn(`⚠️  could not refresh ${fileName} (${error.message}), keeping the existing mirror`);
    } else {
      console.warn(`⚠️  could not fetch ${fileName} (${error.message}) and no mirror exists yet`);
    }
  }
};

mkdirSync(OUTPUT_DIR, { recursive: true });
await sync('vendored-seedit-defaults.json', loadSeeditDefaults);
await sync('vendored-5chan-defaults.json', load5chanDefaults);
