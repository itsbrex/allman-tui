# CLAUDE.md — allman-tui

Terminal UI for the allman LinkedIn messenger. A React/Ink front-end over the standalone `allman`
binary and its on-disk store — no server, no daemon, no database.

`CONTEXT.md` holds the vocabulary; this file holds the operational rules. When they disagree, this
file wins and `CONTEXT.md` gets corrected.

## Stack

- **Bun** — runtime, test runner, and build tool (`bun build --compile`)
- **TypeScript** (strict, `noUncheckedIndexedAccess`) — language
- **React 19 + Ink 7** — the terminal renderer
- **`bun:test`** — testing, with `ink-testing-library` for component render assertions
- **biome** — lint + format

Never install packages without `bun add <package>` (or `bun add -d` for dev deps). Always install
to get the latest version — don't assume a version exists.

## Architecture summary

```
src/index.tsx               entry: resolve store + binary, login if needed, mount Ink
src/app.tsx                 root component, mode state machine, all key handling
src/components/             one component per pane / overlay
src/lib/cli.ts              spawnAllman / spawnAllmanSync — the ONLY way to run the binary
src/lib/allman.ts           store readers + typed wrappers for each allman subcommand
src/lib/bundled-bin.ts      extracts the embedded allman binary on first launch
src/lib/templates.ts        TUI-local quick-reply templates
src/lib/types.ts            RECORD.json / JSONL shapes as the TUI sees them
scripts/build.ts            embeds a real allman binary, compiles, restores the stub
scripts/dev-link.ts         links this checkout onto PATH for local development
tests/unit/                 fast, no network, no subprocess
```

## Critical patterns

### Reads from disk, writes through the binary

- **Reads** (conversation list, messages, slug resolution, stored connections) parse the store's
  JSON/JSONL **directly**. Per-keystroke navigation cannot afford a process spawn.
- **Writes** (`send`, `sync`, `connections`, `enrich`, `connect`, reactions) shell out to `allman`,
  which owns rate limiting, quotas, pre-send sync, duplicate detection, and the git commit.

**The TUI never writes into the store itself.** Editing a `RECORD.json` or appending to a JSONL
file from here is a bug however correct the write looks — it bypasses every guardrail the CLI
exists to enforce, and the next CLI sync will not know what happened.

### One invocation point

Every subprocess goes through `spawnAllman` / `spawnAllmanSync` in `src/lib/cli.ts`. They prepend
`--store <resolveStore()>` and set `ALLMAN_STORE` in the child environment. Calling
`child_process.spawn` on the binary anywhere else drops data into whatever `./.allman` the
working directory implies — which is exactly the bug the wrapper prevents.

### Resolution order

Binary (`resolveBin()`): `ALLMAN_BIN` → binary embedded in a compiled `dist/allman-tui` →
`allman` on `PATH`.

Store (`resolveStore()`): `ALLMAN_STORE` → `$HOME/.allman`, **always**. Never the CLI's own default
of `./.allman`, which follows the working directory the TUI was launched from.

### The `assets/allman` stub

`assets/allman` is a 4-byte `STUB` committed so the `with { type: "file" }` import resolves in dev.
`scripts/build.ts` overwrites it with a real binary, compiles, and restores the stub in a `finally`
block. If a working tree ever shows a multi-megabyte `assets/allman`, a build died halfway —
restore the stub, don't commit it.

### Listen is best-effort

`allman listen` runs as a long-lived subprocess and its NDJSON stream nudges the TUI to re-read the
store. If it dies, the status dot turns red and everything else keeps working. Never make correct
behaviour depend on the stream: the store is the source of truth. `ALLMAN_TUI_LISTEN=0` disables it.

### TTY and login happen before Ink mounts

`src/index.tsx` checks `process.stdin.isTTY`, then runs `allman login` with inherited stdio when
there are no accounts or the session's cookies are invalid. This must stay **before** `render()` —
once Ink owns the terminal, the CLI's browser-auth prompts have nowhere to go.

## Development

```bash
bun install
bun run dev          # runs src/index.tsx directly
bun test             # bun:test, tests/unit/
bun run typecheck    # tsc --noEmit
bun run lint         # biome check src tests
bun run build        # embeds `allman`, compiles → dist/allman-tui
```

### Running the local dev version

`bun run link` symlinks `~/.local/bin/allman-tui` at `bin/allman-tui`, a shim that execs
`bun src/index.tsx`. So `allman-tui` on PATH is the working tree — no rebuild between an edit and
the next run.

The shim also sets `ALLMAN_BIN` to a sibling `allman-cli` checkout's `bin/allman` shim when one
exists, so **the dev TUI drives the dev CLI** rather than a released binary. Override the checkout
location with `ALLMAN_CLI_REPO`; an explicit `ALLMAN_BIN` always wins.

```bash
bun run link           # ~/.local/bin/allman-tui -> ./bin/allman-tui
bun run link --force   # ...moving an installed allman-tui aside first
bun run unlink         # remove it, restore whatever was displaced
```

Run `bun run link` in `allman-cli` too, so both commands come from source. Neither release install
is destroyed: a displaced binary is kept at `<name>.pre-dev-link` and restored by `unlink`.

Note the TUI resolves the CLI **as a binary**, never by importing its source. That boundary is
deliberate — the shim satisfies it the same way a release build does.

### Pre-commit

husky + lint-staged run on every commit: biome over staged `src`/`tests` files, then
`bun run typecheck`, then `bun run test`. The suite is a couple of seconds, cheap enough to gate
every commit. Don't add `--no-verify` to a workflow; fix the failure.

## Testing

`tests/unit/` — fast, no network, no subprocess. Component tests render with `ink-testing-library`
and assert on `lastFrame()`; keep them about what the user sees, not internal state.

Anything that would spawn `allman` or hit the filesystem outside a temp directory does not belong
in `tests/unit/`.

## Agent skills

### Issue tracker

All ticket writes go to the fork, `itsbrex/allman-tui`; upstream `tarkaai/allman-tui` is a
read-only source (no push access). Never write a bare `#N` — always `owner/repo#N`. Bugs whose fix
belongs in the CLI are filed on `itsbrex/allman-cli`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, label string equal to role name (`needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root plus ADRs in `docs/adr/`. Domain terms owned by
the CLI are read from its checkout rather than redefined here. See `docs/agents/domain.md`.
