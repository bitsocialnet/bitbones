[![Release](https://img.shields.io/github/v/release/bitsocialnet/bitbones)](https://github.com/bitsocialnet/bitbones/releases/latest)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-red.svg)](https://github.com/bitsocialnet/bitbones/blob/master/LICENSE)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

# bitbones

bitbones is a bare bones GUI client for the [Bitsocial protocol](https://bitsocial.net) — the smallest useful surface over [`@bitsocial/bitsocial-react-hooks`](https://github.com/bitsocialnet/bitsocial-react-hooks). It exists to make the protocol legible: almost no styling, no product opinions, and every view a thin wrapper over one hook, so it is the fastest place to reproduce a bug or try a hooks change against real communities.

- Web version: https://bitbones.app
- Desktop version (full p2p bitsocial node, seeds automatically): available for Mac/Windows/Linux, [download from the release page](https://github.com/bitsocialnet/bitbones/releases/latest)
- Mobile version: available for Android, [download from the release page](https://github.com/bitsocialnet/bitbones/releases/latest)

## Switching default community lists

bitbones does not curate its own default communities. The feed reads whichever client's list you pick, straight from [bitsocialnet/lists](https://github.com/bitsocialnet/lists):

- **seedit** — [`seedit-default-subscriptions.json`](https://github.com/bitsocialnet/lists/blob/master/seedit-default-subscriptions.json), the exact communities new Seedit accounts subscribe to.
- **5chan** — [`5chan-directories/`](https://github.com/bitsocialnet/lists/tree/master/5chan-directories), resolved the way 5chan resolves it: one winning board per directory code, ranked by score, then by when it was added, then by address.

The switch sits at the left of the menu bar on the `p/all` feed and shows both client marks, the active one lit. The selection persists in `localStorage` under `bitbonesDefaultList`. Both lists are also vendored into `src/data/` at build time by `yarn sync:lists`, so bitbones still has a feed when GitHub is unreachable.

seedit is the default because its list is 10 communities against 5chan's 64, and every extra community is another name resolution and page fetch on a cold peer-to-peer start.

## Development

```sh-session
nvm install
nvm use
corepack enable
yarn install
yarn start
```

| command | what it does |
| --- | --- |
| `yarn start` | vite dev server on http://localhost:5173 |
| `yarn build` | production build into `build/` |
| `yarn sync:lists` | refresh the vendored default community lists from bitsocialnet/lists |
| `yarn lint` | oxlint |
| `yarn type-check` | `tsc --noEmit` over `src/` |
| `yarn prettier` | oxfmt |
| `yarn knip` | unused/undeclared dependency check |
| `yarn electron:dev` | run the desktop app against the dev server |
| `yarn electron:make` | package the desktop app |

## Origins

bitbones is a port of an existing GPL bare-bones client onto the Bitsocial stack: `@bitsocial/bitsocial-react-hooks` for all protocol access, communities throughout, and the dependency stack brought up to the same versions 5chan and Seedit run. The first commit in this repository is the unmodified upstream source, so the entire port is reviewable as a single diff.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
