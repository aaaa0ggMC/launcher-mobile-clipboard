# 移动剪贴板 · Mobile Clipboard

An ability for **Linux System Cockpit** (Electron + Vue 3 + Vuetify 3): a clipboard history
manager built for phones, where input methods sometimes disable the system clipboard.

Copied text becomes an **endless waterfall** of cards you can search, pin, edit and re-copy.
History is split into two isolated sinks:

- **normal** — transparent to AI.
- **private** — sensitive; AI must be granted clearance before it can read, edit, delete or
  clear anything in this sink (privacy SDK, consent window).

因为手机上的输入法（如讯飞离线模式）会禁用自带剪贴板，复制过的东西转眼就没了。
这个能力把系统剪贴板做成无限瀑布流，随时能翻出来重新复制；私密水槽里的内容 AI 访问
必须先经过你的授权。

## Features

- Endless multi-column waterfall, newest first, incremental loading, pinned entries on top.
- Two isolated sinks (`normal` / `private`) with per-sink capacity and clearing.
- Auto-capture by polling the system clipboard while a UI is visible.
- Heuristic routing of OTPs / passwords / tokens into the private sink.
- Search, pin, edit, move between sinks, delete; copy an entry straight back to the clipboard.
- Full CLI surface (`launcher-mobile-clipboard.*`), UI is a thin shell over it.
- Privacy-tagged private cards (`v-privacy`) so AI snapshots / screenshots are redacted.

## Platform notes

Clipboard **writing** is easy everywhere (`window.cockpit.copyText()`). Clipboard **reading**
is the hard part:

| Host             | Read path                                                        |
| ---------------- | ---------------------------------------------------------------- |
| Electron desktop | main-process `clipboard.readText()` via `clipboard:read`         |
| Android app      | native bridge `clipboard.get` / `clipboard.set` (WebView over http has no `navigator.clipboard`) |
| Browser          | `navigator.clipboard.readText()` (secure contexts only)          |

The ability reads via `window.cockpit.readText()`, with fallbacks to the native client and
`navigator.clipboard` for older hosts.

## Install

Drop the folder into `src/abilities/launcher-mobile-clipboard/` of a Cockpit checkout, then:

```bash
pnpm install
pnpm dev
```

No third-party dependencies — the ability's `package.json` is just a workspace marker.

## Data

`~/.config/LinuxCockpit/launcher-mobile-clipboard/`

- `history.json` — both sinks (atomic writes).
- `config.json` — auto-capture, capacity, privacy and display settings.

## License

MIT. See [LICENSE](LICENSE).
