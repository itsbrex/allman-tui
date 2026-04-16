// Hybrid data layer: direct filesystem reads of the lilac store for fast
// browsing, plus subprocess shell-outs to the standalone `lilac` binary for
// writes and live streaming. The binary is the canonical writer (rate
// limiting, pre-send sync, git commits) — we never write to the store
// ourselves, and we never reach into the CLI's source tree.

import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { getBundledLilacBin } from "./bundled-bin.ts";
import type { Account, Auth, Conversation, ListenEvent, Message, SearchResult } from "./types.ts";

let resolvedBin: string | null = null;
let resolvedStore: string | null = null;

export function getStorePath(): string {
  if (resolvedStore) return resolvedStore;
  // Honor an explicit override; otherwise always default to `$HOME/.lilac`.
  // The directory may not exist yet — that's fine, downstream code reports
  // "no accounts" and prompts the user to run `lilac login`.
  resolvedStore = process.env.LILAC_STORE || join(homedir(), ".lilac");
  return resolvedStore;
}

export function getLilacBin(): string {
  if (resolvedBin) return resolvedBin;
  const env = process.env.LILAC_BIN;
  if (env) {
    resolvedBin = env;
    return resolvedBin;
  }
  // Bundled binary embedded by `bun build --compile`. The first call extracts
  // it to a per-user cache dir; subsequent calls reuse the cached path.
  const bundled = getBundledLilacBin();
  if (bundled) {
    resolvedBin = bundled;
    return resolvedBin;
  }
  // Final fallback: a system install of `lilac` on PATH. Used in dev
  // (`bun run dev`) and as an escape hatch if the embedded asset can't be
  // unpacked for some reason.
  const onPath = typeof Bun !== "undefined" ? Bun.which("lilac") : null;
  if (onPath) {
    resolvedBin = onPath;
    return resolvedBin;
  }
  throw new Error(
    "could not find the `lilac` binary. Set LILAC_BIN to an absolute path, " +
      "install `lilac` on PATH, or rebuild lilac-tui so the bundled binary " +
      "is embedded."
  );
}

// ---------------------------------------------------------------------------
// Account discovery
// ---------------------------------------------------------------------------

export function findAccounts(storePath = getStorePath()): Account[] {
  if (!existsSync(storePath)) return [];
  const entries = readdirSync(storePath, { withFileTypes: true });
  const accounts: Account[] = [];

  // Build a map from profileId-dir → slug by walking symlinks at the top level.
  // The store layout is `{accountSlug} -> {profileId}` so each real account
  // directory may have one or more symlinks pointing at it.
  const slugByProfileId = new Map<string, string>();
  for (const e of entries) {
    const full = join(storePath, e.name);
    try {
      if (!lstatSync(full).isSymbolicLink()) continue;
      const target = readlinkSync(full);
      const resolved = resolve(storePath, target);
      const profileId = resolved.split("/").pop() || resolved;
      if (!slugByProfileId.has(profileId)) slugByProfileId.set(profileId, e.name);
    } catch {
      // ignore broken links
    }
  }

  for (const entry of entries) {
    const full = join(storePath, entry.name);
    try {
      if (lstatSync(full).isSymbolicLink()) continue;
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    const authPath = join(full, "AUTH.json");
    if (!existsSync(authPath)) continue;

    let auth: Auth;
    try {
      auth = JSON.parse(readFileSync(authPath, "utf8"));
    } catch {
      continue;
    }

    accounts.push({
      slug: slugByProfileId.get(entry.name) ?? auth.slug ?? entry.name,
      profileId: entry.name,
      dir: full,
      auth,
    });
  }

  return accounts;
}

/** Re-read AUTH.json for an account to pick up `lastSyncAt` updates from CLI runs. */
export function readAccountAuth(accountDir: string): Auth | null {
  const authPath = join(accountDir, "AUTH.json");
  if (!existsSync(authPath)) return null;
  try {
    return JSON.parse(readFileSync(authPath, "utf8")) as Auth;
  } catch {
    return null;
  }
}

export function resolveSlugToConvId(accountDir: string, slug: string): string | null {
  // Slugs are stored as symlinks at the top of the account dir → convId.
  const linkPath = join(accountDir, slug);
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return null;
    const real = realpathSync(linkPath);
    return real.split("/").pop() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export function loadConversations(accountDir: string): Conversation[] {
  if (!existsSync(accountDir)) return [];
  const entries = readdirSync(accountDir, { withFileTypes: true });
  const convs: Conversation[] = [];

  for (const entry of entries) {
    // Conversation dirs are real (not symlinks) and start with "2-".
    if (!entry.name.startsWith("2-")) continue;
    const full = join(accountDir, entry.name);
    try {
      if (lstatSync(full).isSymbolicLink()) continue;
    } catch {
      continue;
    }
    const recordPath = join(full, "RECORD.json");
    if (!existsSync(recordPath)) continue;
    try {
      const rec = JSON.parse(readFileSync(recordPath, "utf8")) as Conversation;
      convs.push(rec);
    } catch {
      // skip malformed records
    }
  }

  // Most recent activity first.
  convs.sort((a, b) => {
    const at = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const bt = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    return bt - at;
  });

  return convs;
}

export function loadLastMessage(accountDir: string, convId: string): Message | null {
  const msgs = loadMessages(accountDir, convId, 1);
  return msgs.length ? (msgs[msgs.length - 1] ?? null) : null;
}

export function loadMessages(accountDir: string, convId: string, tailN?: number): Message[] {
  const msgDir = join(accountDir, convId, "messages");
  if (!existsSync(msgDir)) return [];
  const files = readdirSync(msgDir)
    .filter((f: string) => f.endsWith(".jsonl"))
    .sort(); // chronological by YYYY-MM

  const out: Message[] = [];
  for (const f of files) {
    const lines = readFileSync(join(msgDir, f), "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as Message);
      } catch {
        // skip
      }
    }
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  if (tailN && out.length > tailN) return out.slice(out.length - tailN);
  return out;
}

// ---------------------------------------------------------------------------
// CLI shell-outs
// ---------------------------------------------------------------------------

type RunOptions = {
  account?: string;
  store?: string;
  timeoutMs?: number;
};

function runLilac(args: string[], opts: RunOptions = {}): Promise<string> {
  const cmd = getLilacBin();
  const fullArgs: string[] = [];
  if (opts.account) fullArgs.push("--account", opts.account);
  fullArgs.push("--store", opts.store || getStorePath());
  fullArgs.push(...args);

  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, fullArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LILAC_STORE: opts.store || getStorePath() },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const t = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          rejectP(new Error(`lilac timed out: ${args.join(" ")}`));
        }, opts.timeoutMs)
      : null;
    child.on("error", (err) => {
      if (t) clearTimeout(t);
      rejectP(err);
    });
    child.on("close", (code) => {
      if (t) clearTimeout(t);
      if (code !== 0) {
        rejectP(new Error(`lilac exited ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      resolveP(stdout);
    });
  });
}

/**
 * Spawn lilac in --json mode and stream NDJSON events to a callback.
 *
 * `lilac sync --json` emits one JSON object per line on stdout. Each line is
 * forwarded to `onEvent` so callers can display progress as it arrives. The
 * returned promise resolves with the final summary event when the process
 * exits, or rejects on non-zero exit.
 */
function streamLilac(
  args: string[],
  opts: RunOptions & { onEvent?: (event: SyncEvent) => void } = {}
): Promise<SyncEvent | null> {
  const cmd = getLilacBin();
  const fullArgs: string[] = [];
  if (opts.account) fullArgs.push("--account", opts.account);
  fullArgs.push("--store", opts.store || getStorePath());
  fullArgs.push(...args);

  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, fullArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LILAC_STORE: opts.store || getStorePath() },
    });

    let stdoutBuf = "";
    let stderr = "";
    let last: SyncEvent | null = null;
    const t = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          rejectP(new Error(`lilac timed out: ${args.join(" ")}`));
        }, opts.timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString();
      while (true) {
        const nl = stdoutBuf.indexOf("\n");
        if (nl === -1) break;
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line) as SyncEvent;
          last = ev;
          opts.onEvent?.(ev);
        } catch {
          // ignore non-JSON noise (rare — listen/sync should always emit JSON in --json mode)
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (t) clearTimeout(t);
      rejectP(err);
    });
    child.on("close", (code) => {
      if (t) clearTimeout(t);
      if (code !== 0) {
        rejectP(new Error(`lilac exited ${code}: ${stderr.trim() || "(no stderr)"}`));
        return;
      }
      resolveP(last);
    });
  });
}

function parseJsonOutput<T>(raw: string): T {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("empty lilac output");
  return JSON.parse(trimmed) as T;
}

// ---------------------------------------------------------------------------
// Sync streaming events
// ---------------------------------------------------------------------------

/** Union of NDJSON events emitted by `lilac sync --json`. */
export type SyncEvent =
  | {
      event: "sync.start";
      scope: "inbox" | "conversation";
      account: string;
      from: number;
      to: number;
      convId?: string;
      slug?: string | null;
      limit?: number | null;
    }
  | {
      event: "sync.conversation";
      account: string;
      convId: string;
      slug: string | null;
      name: string;
      conversationsSeen: number;
    }
  | {
      event: "sync.conversation.progress";
      convId: string;
      slug: string | null;
      messagesFetched: number;
      oldestMessageAt: number | null;
      newestMessageAt: number | null;
    }
  | {
      event: "sync.complete";
      scope: "inbox" | "conversation";
      account: string;
      conversationsSynced?: number;
      messagesSynced: number;
      convId?: string;
      slug?: string | null;
    };

export async function searchProfiles(
  query: string,
  opts: RunOptions & { limit?: number } = {}
): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const args = ["search", query, "--json"];
  if (opts.limit) args.push("--limit", String(opts.limit));
  const out = await runLilac(args, { ...opts, timeoutMs: 15_000 });
  return parseJsonOutput<SearchResult[]>(out);
}

export async function sendMessage(
  to: string,
  text: string,
  opts: RunOptions = {}
): Promise<unknown> {
  const out = await runLilac(["send", to, text, "--json"], { ...opts, timeoutMs: 30_000 });
  try {
    return parseJsonOutput<unknown>(out);
  } catch {
    return { ok: true, raw: out };
  }
}

export type ReactOptions = RunOptions & {
  /** Specific message URN to react to. Defaults to most recent in the conversation. */
  message?: string;
  /** Remove the reaction instead of adding. */
  unreact?: boolean;
};

/**
 * Add or remove an emoji reaction on a message via `lilac react`.
 * `target` can be a slug, conversation URN, or LinkedIn URL.
 */
export async function reactToMessage(
  target: string,
  emoji: string,
  opts: ReactOptions = {}
): Promise<unknown> {
  const args = ["react", target, emoji, "--json"];
  if (opts.message) args.push("--message", opts.message);
  if (opts.unreact) args.push("--unreact");
  const out = await runLilac(args, { ...opts, timeoutMs: 15_000 });
  try {
    return parseJsonOutput<unknown>(out);
  } catch {
    return { ok: true, raw: out };
  }
}

export type SyncInboxOptions = RunOptions & {
  /** Older boundary — duration ("1mo") or ISO date. */
  from?: string;
  /** Newer boundary — duration or ISO date. Defaults to now. */
  to?: string;
  /** Max conversations to walk. */
  limit?: number;
  /** Stream NDJSON progress events as the sync runs. */
  onEvent?: (event: SyncEvent) => void;
  /** Full re-sync: upsert all fetched messages (fixes stale reactions, parser changes). */
  resync?: boolean;
};

export async function syncInbox(opts: SyncInboxOptions = {}): Promise<SyncEvent | null> {
  const args = ["sync", "--json"];
  if (opts.from) args.push("--from", opts.from);
  if (opts.to) args.push("--to", opts.to);
  if (opts.limit !== undefined) args.push("--limit", String(opts.limit));
  if (opts.resync) args.push("--resync");
  return streamLilac(args, { ...opts, timeoutMs: 600_000 });
}

export type SyncConversationOptions = RunOptions & {
  /** Older boundary. Defaults to "all of time" so backfill walks the whole history. */
  from?: string;
  /** Newer boundary. Defaults to now. */
  to?: string;
  /** Max messages to fetch in this run. */
  limit?: number;
  onEvent?: (event: SyncEvent) => void;
};

export async function syncConversation(
  convOrSlug: string,
  opts: SyncConversationOptions = {}
): Promise<SyncEvent | null> {
  const args = ["sync", convOrSlug, "--json"];
  if (opts.from) args.push("--from", opts.from);
  if (opts.to) args.push("--to", opts.to);
  if (opts.limit !== undefined) args.push("--limit", String(opts.limit));
  return streamLilac(args, { ...opts, timeoutMs: 600_000 });
}

/** Legacy alias kept for callers that just want a fire-and-forget full sync. */
export async function syncAll(opts: RunOptions & { since?: string } = {}): Promise<void> {
  await syncInbox({ ...opts, from: opts.since });
}

// ---------------------------------------------------------------------------
// Live event stream via `lilac listen`
// ---------------------------------------------------------------------------

export type ListenHandle = {
  stop: () => void;
};

export function startListen(
  onEvent: (e: ListenEvent) => void,
  onStatus: (s: "starting" | "connected" | "disconnected" | "error", info?: string) => void,
  opts: RunOptions = {}
): ListenHandle {
  const cmd = getLilacBin();
  const args: string[] = [];
  if (opts.account) args.push("--account", opts.account);
  args.push("--store", opts.store || getStorePath());
  args.push("listen");

  onStatus("starting");
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LILAC_STORE: opts.store || getStorePath() },
  });

  let stopped = false;
  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    while (true) {
      const nl = buf.indexOf("\n");
      if (nl === -1) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line) as ListenEvent;
        if (ev.event === "connected") onStatus("connected");
        onEvent(ev);
      } catch {
        // ignore non-JSON noise
      }
    }
  });
  child.stderr.on("data", () => {
    // listen logs to stderr; intentionally swallowed.
  });
  child.on("close", () => {
    if (!stopped) onStatus("disconnected");
  });
  child.on("error", (err) => {
    onStatus("error", err.message);
  });

  return {
    stop: () => {
      stopped = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    },
  };
}
