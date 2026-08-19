/**
 * The `:` command palette: the grammar in `parseCommand` and the dispatch in
 * `executeCommand`. The binary owns every guard that matters, so what's worth
 * testing is that palette input parses faithfully and lands on the right
 * callback. Network functions are injected spies — no subprocess.
 */
import { describe, expect, test } from "bun:test";

import { type CommandDeps, executeCommand, parseCommand } from "../../src/lib/commands.ts";

describe("parseCommand", () => {
  test("empty input is a no-op", () => {
    expect(parseCommand("")).toEqual({ kind: "none" });
    expect(parseCommand("   ")).toEqual({ kind: "none" });
  });

  test("strips a leading colon", () => {
    expect(parseCommand(":quit")).toEqual({ kind: "quit" });
  });

  test("quit and reload have short aliases", () => {
    expect(parseCommand("q")).toEqual({ kind: "quit" });
    expect(parseCommand("reload")).toEqual({ kind: "reload" });
    expect(parseCommand("r")).toEqual({ kind: "reload" });
  });

  test("bare sync is an inbox sync with CLI defaults", () => {
    expect(parseCommand("sync")).toEqual({ kind: "syncInbox" });
  });

  test("sync <slug> backfills that conversation", () => {
    expect(parseCommand("sync syn-user")).toEqual({
      kind: "syncConversation",
      target: "syn-user",
    });
  });

  test("sync inbox takes --from and --limit forms", () => {
    expect(parseCommand("sync inbox")).toEqual({
      kind: "syncInbox",
      from: undefined,
      limit: undefined,
    });
    expect(parseCommand("sync inbox 1mo")).toEqual({
      kind: "syncInbox",
      from: "1mo",
      limit: undefined,
    });
    expect(parseCommand("sync inbox 1mo 100")).toEqual({
      kind: "syncInbox",
      from: "1mo",
      limit: 100,
    });
  });

  test("backfill, help and templates with aliases", () => {
    expect(parseCommand("backfill")).toEqual({ kind: "backfill" });
    expect(parseCommand("help")).toEqual({ kind: "help" });
    expect(parseCommand("?")).toEqual({ kind: "help" });
    expect(parseCommand("templates")).toEqual({ kind: "templates" });
    expect(parseCommand("t")).toEqual({ kind: "templates" });
  });

  test("connections parses limit and salesnav in any order", () => {
    expect(parseCommand("connections")).toEqual({
      kind: "connections",
      limit: undefined,
      salesnav: false,
    });
    expect(parseCommand("connections 500")).toEqual({
      kind: "connections",
      limit: 500,
      salesnav: false,
    });
    expect(parseCommand("connections salesnav 500")).toEqual({
      kind: "connections",
      limit: 500,
      salesnav: true,
    });
  });

  test("enrich parses target, limit and deep in any order", () => {
    expect(parseCommand("enrich")).toEqual({
      kind: "enrich",
      target: undefined,
      deep: false,
      limit: undefined,
    });
    expect(parseCommand("enrich deep")).toEqual({
      kind: "enrich",
      target: undefined,
      deep: true,
      limit: undefined,
    });
    expect(parseCommand("enrich syn-user 25 deep")).toEqual({
      kind: "enrich",
      target: "syn-user",
      deep: true,
      limit: 25,
    });
  });

  test("connect requires a target", () => {
    expect(parseCommand("connect syn-user")).toEqual({
      kind: "connect",
      target: "syn-user",
      note: undefined,
    });
    expect(parseCommand("connect syn-user glad we met at the conf")).toEqual({
      kind: "connect",
      target: "syn-user",
      note: "glad we met at the conf",
    });
    // Bare "connect" doesn't match the "connect " prefix — same as any typo.
    expect(parseCommand("connect")).toEqual({ kind: "unknown", cmd: "connect" });
  });

  test("connect rejects a note over LinkedIn's 300-char cap", () => {
    const parsed = parseCommand(`connect syn-user ${"x".repeat(301)}`);
    expect(parsed).toEqual({
      kind: "invalid",
      message: "note is 301 chars — LinkedIn caps notes at 300",
    });
  });

  test("anything else is unknown", () => {
    expect(parseCommand("wibble")).toEqual({ kind: "unknown", cmd: "wibble" });
  });
});

type Call = unknown[];

function makeDeps(overrides: Partial<CommandDeps> = {}): { deps: CommandDeps; calls: Call[] } {
  const calls: Call[] = [];
  const record =
    (name: string, result?: Promise<unknown>) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return result as never;
    };
  const deps: CommandDeps = {
    quit: record("quit"),
    reload: record("reload"),
    showToast: record("showToast"),
    setMode: record("setMode"),
    syncInbox: record("syncInbox"),
    syncConversation: record("syncConversation"),
    backfillTarget: "syn-user",
    pullConnections: record("pullConnections", Promise.resolve("")),
    enrichConnections: record("enrichConnections", Promise.resolve("")),
    sendConnectionRequest: record("sendConnectionRequest", Promise.resolve({})),
    ...overrides,
  };
  return { deps, calls };
}

/** Let the .then/.catch chains inside executeCommand settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("executeCommand", () => {
  test("none does nothing", () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "none" }, deps);
    expect(calls).toEqual([]);
  });

  test("quit quits", () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "quit" }, deps);
    expect(calls).toEqual([["quit"]]);
  });

  test("reload reloads and confirms", () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "reload" }, deps);
    expect(calls).toEqual([["reload"], ["showToast", "reloaded from store"]]);
  });

  test("syncInbox forwards from/limit", () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "syncInbox", from: "1mo", limit: 100 }, deps);
    expect(calls).toEqual([["syncInbox", { from: "1mo", limit: 100 }]]);
  });

  test("backfill targets the selected conversation, or complains", () => {
    const withSelection = makeDeps();
    executeCommand({ kind: "backfill" }, withSelection.deps);
    expect(withSelection.calls).toEqual([["syncConversation", "syn-user"]]);

    const noSelection = makeDeps({ backfillTarget: null });
    executeCommand({ kind: "backfill" }, noSelection.deps);
    expect(noSelection.calls).toEqual([["showToast", "no conversation selected"]]);
  });

  test("help and templates switch modes", () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "help" }, deps);
    executeCommand({ kind: "templates" }, deps);
    expect(calls).toEqual([
      ["setMode", "help"],
      ["setMode", "templateManage"],
    ]);
  });

  test("connections pulls, then reloads and confirms", async () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "connections", limit: 500, salesnav: true }, deps);
    await settle();
    expect(calls).toEqual([
      ["showToast", "pulling connections…"],
      ["pullConnections", { limit: 500, salesnav: true }],
      ["reload"],
      ["showToast", "connections updated"],
    ]);
  });

  test("connections surfaces a failure as a toast", async () => {
    const { deps, calls } = makeDeps({
      pullConnections: () => Promise.reject(new Error("quota")),
    });
    executeCommand({ kind: "connections", salesnav: false }, deps);
    await settle();
    expect(calls).toEqual([
      ["showToast", "pulling connections…"],
      ["showToast", "connections failed: Error: quota"],
    ]);
  });

  test("enrich names its target in the toast", async () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "enrich", target: "syn-user", deep: true, limit: 25 }, deps);
    await settle();
    expect(calls).toEqual([
      ["showToast", "enriching syn-user…"],
      ["enrichConnections", { target: "syn-user", deep: true, limit: 25 }],
      ["reload"],
      ["showToast", "enrichment complete"],
    ]);
  });

  test("enrich without a target sweeps stored connections", async () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "enrich", deep: false }, deps);
    await settle();
    expect(calls[0]).toEqual(["showToast", "enriching connections…"]);
  });

  test("connect passes the note through and confirms", async () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "connect", target: "syn-user", note: "hello" }, deps);
    await settle();
    expect(calls).toEqual([
      ["showToast", "sending request to syn-user…"],
      ["sendConnectionRequest", "syn-user", { note: "hello" }],
      ["showToast", "connection request sent to syn-user"],
    ]);
  });

  test("connect surfaces a failure as a toast", async () => {
    const { deps, calls } = makeDeps({
      sendConnectionRequest: () => Promise.reject(new Error("already pending")),
    });
    executeCommand({ kind: "connect", target: "syn-user" }, deps);
    await settle();
    expect(calls).toEqual([
      ["showToast", "sending request to syn-user…"],
      ["showToast", "connect failed: Error: already pending"],
    ]);
  });

  test("invalid and unknown commands toast the reason", () => {
    const { deps, calls } = makeDeps();
    executeCommand({ kind: "invalid", message: "usage: :connect <slug> [note]" }, deps);
    executeCommand({ kind: "unknown", cmd: "wibble" }, deps);
    expect(calls).toEqual([
      ["showToast", "usage: :connect <slug> [note]"],
      ["showToast", "unknown command: :wibble"],
    ]);
  });
});
