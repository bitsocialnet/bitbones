---
version: alpha
name: bitbones
description: A compact protocol inspector for Bitsocial.
colors:
  bg: "#111111"
  bg2: "#191919"
  border: "#2a2a2a"
  fg: "#e2e2e2"
  dim: "#9a9a9a"
  link: "#9ecbff"
  warn: "#e3a35b"
  error: "#ff7b72"
  sel: "#1f2a36"
typography:
  body:
    fontFamily: "ui-monospace, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "ui-monospace, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  post-title:
    fontFamily: "ui-monospace, Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  square: "0"
spacing:
  gutter: "12px"
  feed-row-block: "8px"
  data-row-block: "2px"
  hairline: "1px"
components:
  feed-row:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "8px 12px"
  feed-row-selected:
    backgroundColor: "{colors.sel}"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "8px 12px"
  inspector-json:
    backgroundColor: "{colors.bg2}"
    textColor: "{colors.fg}"
    typography: "{typography.data}"
    rounded: "{rounded.square}"
    padding: "8px"
---

# Design

## Overview

bitbones presents a Bitsocial feed and the data behind it side by side. The feed stays easy to scan while the surrounding panes answer where the data came from, what the hook returned, and what is still loading. Prefer compact text, flat rows, and controls labeled with the action they perform.

The [README screenshot](docs/assets/readme-screenshot.png) shows the wider layout. See [PRODUCT.md](PRODUCT.md) for the workflows it serves.

## Colors

The palette above describes the default dark theme. Use semantic CSS variables from [`src/themes.css`](src/themes.css) for implementation. The available themes are dark, light, auto, classic, none, term, and contrast. Auto follows the OS color scheme, and none uses system colors and the default font. Settings can apply user CSS after the selected theme.

| Token | Role |
| --- | --- |
| `--bg` | Page, navigation, and status bar |
| `--bg2` | Secondary surfaces, code blocks, and row hover |
| `--border` | Pane dividers, row separators, and field outlines |
| `--fg` | Primary content and active labels |
| `--dim` | Metadata, timestamps, and field names |
| `--link` | Interactive accents and keyboard focus |
| `--warn` | Loading, retrying, and active log recording |
| `--error` | Failures and error log entries |
| `--sel` | Selected post or reply |

Pair state colors with text or another visible indicator. Give a selected row a persistent treatment that remains visible while hovered.

## Typography

Set interface text with `--font` and protocol details with `--font-mono`. The default is system monospace throughout. Classic and contrast use Verdana for the interface and keep technical text monospace.

- **Interface** uses 12 px type and a 1.45 line height. Feed titles increase to 14 px.
- **Metadata and protocol data** use 11 px for timestamps, verbose lines, key-value tables, JSON, and log lines. Compact pane headings use muted uppercase text.
- **Protocol values** preserve names like `updatedAt` and `signature.type`. Wrap long values and keep verbose labels with their values where space permits. Show a readable age alongside the numeric timestamp when displaying exact timestamps.

## Layout

The [pane layout](src/components/panes/panes.module.css) uses a 260 px context pane and a 380 px inspector beside a flexible content column. The page scrolls for feeds, with the side panes independently scrollable and sticky below the topbar. The topbar and status bar sit at the viewport edges on wider screens.

- Use 12 px horizontal gutters, 8 px vertical feed-row padding, and 1 px separators. Key-value rows use 2 px vertical padding.
- At widths of 1100 px and below, the inspector is hidden and row inspection controls are unavailable. Keep post and reply navigation usable in the content column.
- Below 760 px, the context pane becomes a disclosure above the content. The bars scroll with the page on phones. Keep wide stats tables scrollable within their own containers and let log messages wrap.

## Elevation & Depth

Separate surfaces with hairlines and theme backgrounds. Feed rows use `--bg2` on hover and `--sel` for inspection. Reserve overlays for interactions that need a separate layer, such as posting prompts and protocol challenges.

## Shapes

Use square rows, panes, tables, and text controls as the baseline. Use understated 1 px outlines for controls or labels where a visible boundary improves scanning. Let native inputs retain their recognizable affordances.

## Components

### Navigation and status

Use grouped text links and compact controls in the topbar. Underline the active view. Keep the active account, configured client counts, library and app versions, and log recording indicator in the status bar. List the five newest publish and edit errors above the status line until they are dismissed, each with a control that copies the full error. A sixth error drops the oldest one.

### Feed and thread

Keep the title, author, community, time, and reply count easy to scan. The default-on `verbose` toggle exposes a compact line with CID, protocol version, signature type, update age, votes, and flags when available. Keep feed media collapsed behind `[+]` by default and retain the per-item toggle when media is expanded globally.

### Context and inspector panes

Show the source communities, their last update ages or loading states, and a summary of the hook arguments on the home feed. Give a community or thread its community record and client context.

On a feed, the inspector starts with the hook result summary, then shows the selected record in `fields`, `clients`, and `json` tabs. On a thread, it starts with the post when the record is available. Keep the row click shortcut paired with an explicit `inspect` button for keyboard users. Use key-value tables with exact field names, and retain endpoint redaction in both displayed and copied JSON.

### Tables and logs

Use aligned tables for repeated fields in `/stats` and keep numeric columns consistent for comparison. In `/log`, keep capture, filters, and search above the timestamped text. Preserve the reader's scroll position while new lines arrive.

## Do's and Don'ts

- Reuse the closest shared row, table, or pane and verify its appearance with the active theme variables.
- Keep focus visible, controls reachable by keyboard, and long identifiers readable at narrow widths.
- Avoid hardcoded palette values in product components and decorative layers that compete with protocol data.
- Keep loading, failure, empty, and selected states legible in the views that expose them.
