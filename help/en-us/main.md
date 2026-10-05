# Mobile Clipboard

> Last updated: 2026-10-06

On phones, an input method (e.g. iFlytek in offline mode) can disable its own clipboard, so
whatever you copy simply disappears. Mobile Clipboard turns the system clipboard into an
**endless waterfall**: copied text lands in a history you can scroll and re-copy any time.
History has two isolated sinks — **normal** and **private** — and AI must get your approval
before reading private content.

> Quick start: copy text on your phone → switch back to Cockpit → open “Mobile Clipboard”;
> it is already at the top. Tap the copy icon on a card to put it back on the system clipboard.

## What it does

- **Endless waterfall**: cards fill multiple columns, newest first, loading more as you scroll; pinned entries stay on top.
- **Two sinks**: `normal` is transparent to AI; `private` is sensitive — reading, editing, deleting and clearing all require consent.
- **Auto-capture**: while a UI is visible it polls the system clipboard and records changes (on by default in the Android app, off on desktop).
- **Credential routing**: pure digit OTPs, `password`/`token`-looking strings and long random strings go to the private sink automatically.
- **Organise**: search, pin, edit, move between sinks, delete, clear a sink.

## UI at a glance

| Area          | Location   | Notes                                                        |
| ------------- | ---------- | ------------------------------------------------------------ |
| Sink switch   | Toolbar    | Switch the waterfall between Normal / Private                |
| Search        | Toolbar    | Substring filter within the current sink                     |
| Capture / New | Toolbar    | Capture reads the system clipboard once; New saves typed text |
| Cards         | Main body  | One card per entry; hover reveals copy / pin / move / edit / delete |
| More menu     | Toolbar    | Reveal/mask private, toggle blur, refresh, clear, settings   |

## Common tasks

### Capture the clipboard

Tap **Capture** (or use the shortcut) to read the system clipboard once. With auto-capture on
you don't need to: every 1.5s while visible it checks and records any change.

> The OS only lets a **foreground** app read the clipboard on Android 10+, so switch back to
> Cockpit after copying. It captures once the moment you return, so nothing is missed.

### Normal ↔ private

- Auto-capture writes to `normal` by default; set “Auto-capture writes to” to `private` to send everything there.
- Tap the lock icon on any card to move it between sinks.
- Private content is blurred by default; tap a card or “Reveal private content” to see it.

### Put it back on the clipboard

Tap the copy icon on a card — the text returns to the system clipboard, ready to paste anywhere.

## Privacy & AI

- `launcher-mobile-clipboard.private` is a **sensitive** scope: when AI reads / writes / deletes
  private content the command registry opens the consent window first.
- Private cards carry a `v-privacy` tag, so AI snapshots and screenshots are redacted whether or
  not you revealed the text.
- The normal sink has no restrictions — put anything you care about in the private sink.

## CLI

```bash
launcher-mobile-clipboard.list --sink normal --limit 50
launcher-mobile-clipboard.append --text "hello" --sink normal
launcher-mobile-clipboard.update --id <id> --pinned true
launcher-mobile-clipboard.delete --id <id>
launcher-mobile-clipboard.clear --sink private
launcher-mobile-clipboard.config-get
launcher-mobile-clipboard.config-set --config '{"autoCapture":true}'
launcher-mobile-clipboard.stats
launcher-mobile-clipboard.system-read
```

## FAQ

**“Clipboard is empty” when I capture?** Make sure the app is in the foreground (Android blocks
background reads). In a plain browser `navigator.clipboard` only exists in a secure context
(`https` / `localhost`), so over plain LAN `http` use the Android app or the desktop build.

**Where is history stored?** `~/.config/LinuxCockpit/launcher-mobile-clipboard/history.json`.
It is not encrypted — clear the private sink periodically if that matters.
