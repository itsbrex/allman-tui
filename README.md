# lilac-tui

A re-imagined LinkedIn messenger inbox, in your terminal. A thin terminal
front-end over the standalone `lilac` binary and its on-disk message store.

```
┌─ lilac · your-account ──────────┬─────────────────────────────────────────────┐
│ / search                     │ Jamie Rivera  @jamie-rivera                 │
│ ──────────────────────────── │ Senior Engineer | Building …         │
│ ▸ ● Jamie Rivera         3d  │                                             │
│   you: Hey Jamie! I sent…    │ ─── Apr 3 ───                               │
│                              │ Jamie  3:46p                                │
│   ● Taylor Osei    4d  │   Submitted                                 │
│   you: Hi Taylor, a fellow…│                                             │
│                              │ ─── Apr 7 ───                               │
│   ○ Morgan Patel     1w  │ you  4:28p                                  │
│   you: Morgan, thanks for…     │   Hey Jamie! I sent a message to John…      │
│   …                          │                                             │
├──────────────────────────────┴─────────────────────────────────────────────┤
│ ▶ Reply to Jamie…   (press i to compose)                                   │
│ lilac · your-account · ● connected · 292 convs · 4 unread             [browse]│
│ j/k navigate · ↵ open · i compose · / search · n new · r sync · ? help     │
└────────────────────────────────────────────────────────────────────────────┘
```

## Run

```bash
bun install
bun run dev
```

### Bundled `lilac` binary

`bun run build` produces a single self-contained `dist/lilac-tui` executable
with the standalone `lilac` binary embedded inside. On first launch, the
embedded copy is extracted to `$XDG_CACHE_HOME/lilac-tui/bin/lilac-<sha>` and
re-used on every subsequent run — no separate `lilac` install required.

The build script (`scripts/build.ts`) needs to know where to find a real
`lilac` binary to embed; it picks `LILAC_BIN` first, then `lilac` on `PATH`.

### Resolution order at runtime

1. `LILAC_BIN` environment variable (explicit override)
2. The bundled binary embedded in `dist/lilac-tui` (production builds)
3. `lilac` on `PATH` (dev mode and unbundled installs)

Store discovery: `LILAC_STORE` env, otherwise always `$HOME/.lilac`. The
directory doesn't need to exist yet — if it's missing or empty, the TUI
prints a clear "no accounts" error pointing at the bundled `lilac login`
command.

If you have a single account, it loads automatically. Otherwise set
`LILAC_ACCOUNT=<slug>`.

## Architecture

`lilac-tui` is a thin React/Ink front-end over the on-disk lilac message
store and the standalone `lilac` binary. It never reaches into the CLI's
source tree — only the binary on `PATH` (or `LILAC_BIN`) and the
public file-store layout.

- **Reads** (conversation list, message history, slug resolution) come straight
  from the JSONL/JSON files on disk for snappy navigation. No subprocess
  overhead per keystroke.
- **Writes** (`send`, `sync`, `search`) shell out to the `lilac` binary so
  rate limiting, pre-send sync, and git commits go through the canonical path.
- **Live updates** subscribe to `lilac listen`'s NDJSON event stream from a
  long-running subprocess. Disable with `LILAC_TUI_LISTEN=0`.

```
src/
  index.tsx                 entry point
  app.tsx                   root component, mode + state machine
  components/
    Sidebar.tsx             conversation list with inline search
    Thread.tsx              message thread, day-grouped, word-wrapped
    Composer.tsx            reply input
    StatusBar.tsx           account, listen, mode, hint bar
    NewConversation.tsx     contact-search modal for starting threads
    Help.tsx                key reference overlay
  lib/
    lilac.ts                file-store reader + lilac binary shell-outs
    bundled-bin.ts          extracts the embedded lilac binary on first run
    types.ts                message / conversation / event shapes
    format.ts               relativeTime, dayLabel, color hashing
scripts/
  build.ts                  copies the lilac binary into assets/, runs
                            `bun build --compile`, restores the stub
assets/
  lilac                     4-byte stub in the repo; replaced with the real
                            lilac binary at build time, then restored
```

## Keys

| Key             | What it does |
| --------------- | ------------ |
| `j` / `↓`       | next conversation |
| `k` / `↑`       | previous conversation |
| `g` / `G`       | top / bottom of list |
| `↵`             | open conversation under cursor (also auto-previewed) |
| `i`             | compose a reply |
| `Esc`           | leave any sub-mode |
| `/`             | filter the conversation list |
| `n`             | search contacts and start a new conversation |
| `:`             | command palette (`sync`, `sync <slug>`, `reload`, `help`, `quit`) |
| `r`             | sync everything from LinkedIn |
| `R`             | reload from the local store (no network) |
| `PgUp` / `PgDn` | scroll the message thread |
| `?`             | toggle help |
| `q` / `Ctrl+C`  | quit |

## Modes

`lilac-tui` is modal — what your keys mean depends on which mode you're in.
The current mode is shown on the right of the status bar (`[browse]`,
`[search]`, `[compose]`, `[new]`, `[command]`, `[help]`). The hint line below
it always reflects the keys available in the current mode.

| Mode       | What you can do |
| ---------- | --------------- |
| `browse`   | navigate conversations, jump into other modes |
| `search`   | filter the sidebar by name / slug / headline |
| `compose`  | type a reply, `↵` to send, `Esc` to cancel |
| `new`      | search contacts via `lilac search`, pick one to open or draft |
| `command`  | type a command palette command |
| `help`     | full keybinding reference |

## Environment

| Variable            | Description |
| ------------------- | ----------- |
| `LILAC_BIN`         | Absolute path to the `lilac` binary. Defaults to `lilac` on `PATH`. |
| `LILAC_STORE`       | Absolute path to a `.lilac` directory. Defaults to `$HOME/.lilac`. |
| `LILAC_ACCOUNT`     | Account slug to use when multiple accounts exist |
| `LILAC_TUI_LISTEN`  | Set to `0`/`false` to disable the `lilac listen` subprocess |

## Notes

- Pre-send sync, rate limiting, and git commits are all handled by `lilac
  send` — the TUI never writes to the store directly.
- Starting a brand-new conversation drafts a placeholder thread in the
  sidebar and creates the real thread on LinkedIn on the first send.
- Listening is best-effort: if the subprocess fails, the status dot in the
  bar turns red and the rest of the app keeps working from the on-disk store.
