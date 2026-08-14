# CONTEXT

The shared vocabulary for allman-tui. Read this before exploring the codebase; use these terms in
issue titles, test names, refactor proposals, and hypotheses. `CLAUDE.md` holds the operational
rules (stack, commands, resolution order) — this file holds the language.

This is a **seed glossary**, derived from terms already resolved in the code and `CLAUDE.md`.
`/grill-with-docs` and `/domain-modeling` sharpen it as new terms come up. When the two files
disagree about a fact, `CLAUDE.md` wins and this file gets corrected.

**The domain lives next door.** Identity spaces (flagship id, salesnav id, member id, slug, URN),
contact vs connection, sweep vs enrich, throttle vs quota vs page delay, the store layout — all of
that is defined in `allman-cli`'s `CONTEXT.md`, and this repo uses those terms unchanged. Read it
in the sibling checkout rather than re-deriving a term here; a second, drifting definition is worse
than a pointer.

## The two halves

| Term | Means | Don't say |
| --- | --- | --- |
| **the CLI** | the `allman` binary, built from `allman-cli` | "the backend", "the server" |
| **the TUI** | this repo — a React/Ink front-end over that binary and its store | "the client", "the app" |
| **the store** | `.allman/`, the CLI's file-backed message store | "the database", "the cache" |

There is no server, no daemon, and no IPC protocol. The TUI reads files and spawns a subprocess;
naming either of those a "backend" invites people to look for a service that does not exist.

## Reads and writes are asymmetric — on purpose

| Term | Means |
| --- | --- |
| **read** | parsing the store's JSON/JSONL **directly from disk**, no subprocess |
| **write** | shelling out to the `allman` binary, which owns the network call |

Reads are direct because per-keystroke navigation cannot afford process spawn latency. Writes go
through the binary because that is where rate limiting, pre-send sync, quota ledgers, duplicate
detection and the git commit live. **The TUI never writes into the store itself** — a change that
has the TUI edit a `RECORD.json` or append to a JSONL file is a bug, not an optimization, however
obviously correct the write looks.

Every subprocess goes through **`spawnAllman` / `spawnAllmanSync`** in `lib/cli.ts` — the single
invocation point that pins `--store`. Calling `child_process.spawn` on the binary anywhere else is
the specific mistake that wrapper exists to prevent.

## Binary resolution

**resolved binary** = whatever `resolveBin()` returns, in this order:

1. **`ALLMAN_BIN`** — explicit override; also how the dev shim points a dev TUI at a dev CLI
2. **bundled binary** — the `allman` embedded in a compiled `dist/allman-tui`
3. **`allman` on `PATH`** — dev mode and unbundled installs

The **bundled binary** is embedded as an asset at build time and **extracted** on first launch to
`$XDG_CACHE_HOME/allman-tui/bin/allman-<sha>`. Say *extract*, not "install" — nothing lands on
`PATH` and nothing is registered.

The **stub** is the 4-byte `STUB` file committed at `assets/allman`. It exists so the import
resolves in dev; `scripts/build.ts` overwrites it with a real binary and always restores it
afterwards. A multi-megabyte `assets/allman` in a working tree means a build died halfway.

**Store resolution is separate and much simpler**: `ALLMAN_STORE`, else `$HOME/.allman` — never the
CLI's own default of `./.allman`, which would follow the working directory the TUI happened to be
launched from and split writes across stores the TUI cannot see.

## Modes

The TUI is **modal**: what a key means depends on the current mode. `Mode` in `app.tsx` is the
enumeration, the status bar renders it in brackets, and the hint line lists that mode's keys.

`browse` · `search` · `compose` · `new` · `command` · `help` · `templatePick` · `templateManage` ·
`messageSelect` · `reactionPick`

- **browse** is the resting mode; `Esc` returns to it from anywhere.
- **command** is the `:` **palette**, which is how network operations (`sync`, `connections`,
  `enrich`, `connect`) are reached. Call it the palette, not "the command line".
- A **sub-mode** is any non-browse mode. "Leaving a sub-mode" always means returning to browse.

## Panes and rows

| Term | Means | Don't say |
| --- | --- | --- |
| **sidebar** | the left pane: the conversation list | "inbox pane", "list view" |
| **thread** | the right pane: one conversation's messages, day-grouped | "chat window" |
| **composer** | the reply input | "input box" |
| **status bar** | account, listen state, mode, hint line | "footer" |
| **cursor** | the sidebar row under `j`/`k` | "selection" |
| **selected conversation** | the conversation whose thread is displayed | "open chat" |

Cursor and selection are **not** the same thing — the cursor moves with `j`/`k` and auto-previews,
so a bug report needs to say which one it means.

## Listening

**listen** = the long-running `allman listen` subprocess whose NDJSON stream drives live updates.
It is **best-effort**: when it dies the status dot turns red and everything else keeps working off
the store. A **stale** heartbeat means connected-but-quiet, and is distinct from disconnected.

Disable with `ALLMAN_TUI_LISTEN=0`. Anything that makes a working TUI *depend* on listen has broken
the contract — the store is the source of truth, the stream is only a nudge to re-read it.

## Templates

A **template** is a saved reply body, held in TUI-local config
(`$XDG_CONFIG_HOME/allman-tui/templates.json`) and inserted into the composer. A template body may
carry **placeholders** — `{firstName}`, `{lastName}`, `{name}`, `{slug}` — substituted against the
target conversation when it is inserted.

Templates are UX data, not LinkedIn state: they live outside the store, the CLI knows nothing about
them, and they are not **drafts**. A draft is an unsent message for a conversation that does not
exist on LinkedIn yet — a different thing, with a different lifetime.
