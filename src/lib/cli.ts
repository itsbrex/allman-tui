// Single source of truth for invoking the standalone `allman` binary from
// the TUI. Every subprocess launched by the TUI MUST go through `spawnAllman`
// or `spawnAllmanSync` — never call `child_process.spawn` with the binary
// directly elsewhere.
//
// Why: the TUI targets `$HOME/.allman` unconditionally (unless the user
// overrides with ALLMAN_STORE). This differs from the CLI's own default of
// `./.allman`, which would resolve against whatever working directory the
// TUI happened to be launched from — effectively splitting writes across
// stores the TUI can't see. Routing every call through one wrapper makes it
// impossible for a future caller to forget `--store` and drop data into a
// project-local `.allman/` by accident.
//
// The wrapper always:
//   - prepends `--store <resolveStore()>` to the argv
//   - sets ALLMAN_STORE in the child's environment
//   - sets ALLMAN_BIN resolution consistent with `resolveBin()`

import {
  type ChildProcess,
  type SpawnSyncReturns,
  type StdioOptions,
  spawn,
  spawnSync,
} from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { getBundledAllmanBin } from "./bundled-bin.ts";

let resolvedBin: string | null = null;
let resolvedStore: string | null = null;

/**
 * Absolute path to the store the TUI reads from and writes through. Always
 * `$HOME/.allman` unless the user explicitly overrides with `ALLMAN_STORE`.
 */
export function resolveStore(): string {
  if (resolvedStore) return resolvedStore;
  resolvedStore = process.env.ALLMAN_STORE || join(homedir(), ".allman");
  return resolvedStore;
}

/**
 * Absolute path to the `allman` binary. Resolution order:
 *   1. ALLMAN_BIN environment variable (explicit override)
 *   2. The binary embedded in this compiled allman-tui (production)
 *   3. `allman` on $PATH (dev / unbundled)
 */
export function resolveBin(): string {
  if (resolvedBin) return resolvedBin;
  const env = process.env.ALLMAN_BIN;
  if (env) {
    resolvedBin = env;
    return resolvedBin;
  }
  const bundled = getBundledAllmanBin();
  if (bundled) {
    resolvedBin = bundled;
    return resolvedBin;
  }
  const onPath = typeof Bun !== "undefined" ? Bun.which("allman") : null;
  if (onPath) {
    resolvedBin = onPath;
    return resolvedBin;
  }
  throw new Error(
    "could not find the `allman` binary. Set ALLMAN_BIN to an absolute path, " +
      "install `allman` on PATH, or rebuild allman-tui so the bundled binary " +
      "is embedded."
  );
}

export type InvokeOptions = {
  /** Account slug. Prepends `--account <slug>` when set. */
  account?: string;
  /** stdio passed to child_process. Defaults vary per entry point. */
  stdio?: StdioOptions;
};

function buildArgv(args: readonly string[], opts: InvokeOptions): string[] {
  const argv: string[] = [];
  if (opts.account) argv.push("--account", opts.account);
  argv.push("--store", resolveStore());
  argv.push(...args);
  return argv;
}

function buildEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ALLMAN_STORE: resolveStore() };
}

/**
 * Async spawn. Default stdio captures stdout/stderr; pass `stdio: "inherit"`
 * for interactive subcommands.
 */
export function spawnAllman(args: readonly string[], opts: InvokeOptions = {}): ChildProcess {
  return spawn(resolveBin(), buildArgv(args, opts), {
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    env: buildEnv(),
  });
}

/**
 * Sync spawn. Used at startup for one-shot probes (`status --json`) and
 * for the interactive login flow, which needs a real TTY.
 */
export function spawnAllmanSync(
  args: readonly string[],
  opts: InvokeOptions = {}
): SpawnSyncReturns<string> {
  return spawnSync(resolveBin(), buildArgv(args, opts), {
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: buildEnv(),
  });
}
