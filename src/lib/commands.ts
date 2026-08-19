// The `:` command palette, split out of app.tsx. `parseCommand` turns raw
// palette input into a typed command; `executeCommand` dispatches it onto the
// injected app callbacks. Parsing is pure so the grammar is testable without
// rendering the app or touching the binary.

import type { Mode } from "./keymap.ts";

export type Command =
  | { kind: "none" }
  | { kind: "quit" }
  | { kind: "reload" }
  | { kind: "syncInbox"; from?: string; limit?: number }
  | { kind: "syncConversation"; target: string }
  | { kind: "backfill" }
  | { kind: "help" }
  | { kind: "templates" }
  | { kind: "connections"; limit?: number; salesnav: boolean }
  | { kind: "enrich"; target?: string; deep: boolean; limit?: number }
  | { kind: "connect"; target: string; note?: string }
  | { kind: "invalid"; message: string }
  | { kind: "unknown"; cmd: string };

export function parseCommand(raw: string): Command {
  const cmd = raw.trim().replace(/^:/, "");
  if (!cmd) return { kind: "none" };
  if (cmd === "quit" || cmd === "q") return { kind: "quit" };
  if (cmd === "reload" || cmd === "r") return { kind: "reload" };
  if (cmd === "sync") return { kind: "syncInbox" };
  if (cmd.startsWith("sync ")) {
    const rest = cmd.slice(5).trim();
    // Forms supported:
    //   sync <slug>            → backfill that conversation
    //   sync inbox 1mo         → inbox sync with --from 1mo
    //   sync inbox 1mo 100     → inbox sync with --from 1mo --limit 100
    if (rest.startsWith("inbox")) {
      const parts = rest.split(/\s+/).slice(1);
      const from = parts[0];
      const limit = parts[1] ? parseInt(parts[1], 10) : undefined;
      return { kind: "syncInbox", from, limit };
    }
    return { kind: "syncConversation", target: rest };
  }
  if (cmd === "backfill") return { kind: "backfill" };
  if (cmd === "help" || cmd === "?") return { kind: "help" };
  if (cmd === "templates" || cmd === "t") return { kind: "templates" };
  if (cmd === "connections" || cmd.startsWith("connections ")) {
    const rest = cmd.slice("connections".length).trim();
    const salesnav = /\bsalesnav\b/.test(rest);
    const limit = /(\d+)/.exec(rest)?.[1];
    return { kind: "connections", limit: limit ? parseInt(limit, 10) : undefined, salesnav };
  }
  if (cmd === "enrich" || cmd.startsWith("enrich ")) {
    const parts = cmd.split(/\s+/).slice(1);
    const deep = parts.includes("deep");
    const rest = parts.filter((p) => p !== "deep");
    const numeric = rest.find((p) => /^\d+$/.test(p));
    const target = rest.find((p) => !/^\d+$/.test(p));
    return { kind: "enrich", target, deep, limit: numeric ? parseInt(numeric, 10) : undefined };
  }
  if (cmd.startsWith("connect ")) {
    // :connect <slug> [note...]  — note is everything after the slug.
    const rest = cmd.slice("connect ".length).trim();
    const [target, ...noteWords] = rest.split(/\s+/);
    if (!target) return { kind: "invalid", message: "usage: :connect <slug> [note]" };
    const note = noteWords.join(" ").trim() || undefined;
    if (note && note.length > 300) {
      return {
        kind: "invalid",
        message: `note is ${note.length} chars — LinkedIn caps notes at 300`,
      };
    }
    return { kind: "connect", target, note };
  }
  return { kind: "unknown", cmd };
}

/** App callbacks a command dispatch is wired onto. */
export type CommandDeps = {
  quit(): void;
  reload(): void;
  showToast(message: string, ms?: number): void;
  setMode(mode: Mode): void;
  syncInbox(opts?: { from?: string; limit?: number }): void;
  syncConversation(target: string): void;
  /** Backfill target for the selected conversation — slug preferred, null when nothing is selected. */
  backfillTarget: string | null;
  pullConnections(opts: { limit?: number; salesnav?: boolean }): Promise<unknown>;
  enrichConnections(opts: { target?: string; deep?: boolean; limit?: number }): Promise<unknown>;
  sendConnectionRequest(target: string, opts: { note?: string }): Promise<unknown>;
};

export function executeCommand(command: Command, deps: CommandDeps): void {
  switch (command.kind) {
    case "none":
      return;
    case "quit":
      deps.quit();
      return;
    case "reload":
      deps.reload();
      deps.showToast("reloaded from store");
      return;
    case "syncInbox":
      deps.syncInbox({ from: command.from, limit: command.limit });
      return;
    case "syncConversation":
      deps.syncConversation(command.target);
      return;
    case "backfill":
      if (deps.backfillTarget) {
        deps.syncConversation(deps.backfillTarget);
      } else {
        deps.showToast("no conversation selected");
      }
      return;
    case "help":
      deps.setMode("help");
      return;
    case "templates":
      deps.setMode("templateManage");
      return;
    // ----- Network commands -----
    // These shell out to the binary, which owns rate limits, volume quotas
    // and duplicate guards. Never re-implement those here.
    case "connections":
      deps.showToast("pulling connections…");
      void deps
        .pullConnections({ limit: command.limit, salesnav: command.salesnav })
        .then(() => {
          deps.reload();
          deps.showToast("connections updated");
        })
        .catch((e: unknown) => deps.showToast(`connections failed: ${String(e)}`));
      return;
    case "enrich":
      deps.showToast(command.target ? `enriching ${command.target}…` : "enriching connections…");
      void deps
        .enrichConnections({ target: command.target, deep: command.deep, limit: command.limit })
        .then(() => {
          deps.reload();
          deps.showToast("enrichment complete");
        })
        .catch((e: unknown) => deps.showToast(`enrich failed: ${String(e)}`));
      return;
    case "connect":
      deps.showToast(`sending request to ${command.target}…`);
      void deps
        .sendConnectionRequest(command.target, { note: command.note })
        .then(() => deps.showToast(`connection request sent to ${command.target}`))
        .catch((e: unknown) => deps.showToast(`connect failed: ${String(e)}`));
      return;
    case "invalid":
      deps.showToast(command.message);
      return;
    case "unknown":
      deps.showToast(`unknown command: :${command.cmd}`);
      return;
  }
}
