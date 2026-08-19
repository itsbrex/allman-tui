/**
 * The modal keymap: pure per-mode key handling. `handleKey` maps a keypress
 * plus a snapshot of app state to a list of actions; `applyKeyAction` forwards
 * each action onto the injected setters. No rendering, no subprocess.
 */
import { describe, expect, test } from "bun:test";

import {
  applyKeyAction,
  handleKey,
  type KeyAction,
  type KeyActionDeps,
  type KeyContext,
  type KeyInput,
} from "../../src/lib/keymap.ts";

function key(overrides: Partial<KeyInput> = {}): KeyInput {
  return {
    escape: false,
    return: false,
    upArrow: false,
    downArrow: false,
    pageUp: false,
    pageDown: false,
    ...overrides,
  };
}

function ctx(overrides: Partial<KeyContext> = {}): KeyContext {
  return {
    mode: "browse",
    selectedConvId: "2-SYNTH1",
    selectedSlug: "syn-user",
    cursorConvId: "2-SYNTH2",
    filteredCount: 3,
    messageCount: 5,
    messageCursorIdx: null,
    ...overrides,
  };
}

describe("handleKey · browse", () => {
  test("q quits", () => {
    expect(handleKey("q", key(), ctx())).toEqual([{ type: "quit" }]);
  });

  test("mode switches: ? / n T :", () => {
    expect(handleKey("?", key(), ctx())).toEqual([{ type: "setMode", mode: "help" }]);
    expect(handleKey("/", key(), ctx())).toEqual([{ type: "setMode", mode: "search" }]);
    expect(handleKey("n", key(), ctx())).toEqual([{ type: "setMode", mode: "new" }]);
    expect(handleKey("T", key(), ctx())).toEqual([{ type: "setMode", mode: "templateManage" }]);
    expect(handleKey(":", key(), ctx())).toEqual([{ type: "setMode", mode: "command" }]);
  });

  test("i composes only with a selected conversation", () => {
    expect(handleKey("i", key(), ctx())).toEqual([{ type: "setMode", mode: "compose" }]);
    expect(handleKey("i", key(), ctx({ selectedConvId: null }))).toEqual([]);
  });

  test("x starts the react flow on the newest message", () => {
    expect(handleKey("x", key(), ctx({ messageCount: 5 }))).toEqual([
      { type: "setMessageCursor", index: 4 },
      { type: "setMode", mode: "messageSelect" },
    ]);
  });

  test("x guards: no selection, no messages", () => {
    expect(handleKey("x", key(), ctx({ selectedConvId: null }))).toEqual([
      { type: "showToast", message: "select a conversation first" },
    ]);
    expect(handleKey("x", key(), ctx({ messageCount: 0 }))).toEqual([
      { type: "showToast", message: "no messages to react to" },
    ]);
  });

  test("t opens the template picker only with a selection", () => {
    expect(handleKey("t", key(), ctx())).toEqual([{ type: "setMode", mode: "templatePick" }]);
    expect(handleKey("t", key(), ctx({ selectedConvId: null }))).toEqual([
      { type: "showToast", message: "select a conversation first" },
    ]);
  });

  test("r forces a 1-day sync window; R does a 7-day resync", () => {
    expect(handleKey("r", key(), ctx())).toEqual([
      { type: "syncInbox", opts: { from: "1d" } },
    ]);
    expect(handleKey("R", key(), ctx())).toEqual([
      { type: "syncInbox", opts: { from: "7d", resync: true } },
    ]);
  });

  test("o opens the contact's profile when a slug exists", () => {
    expect(handleKey("o", key(), ctx())).toEqual([
      { type: "openUrl", url: "https://www.linkedin.com/in/syn-user/" },
      { type: "showToast", message: "opened syn-user's profile" },
    ]);
    expect(handleKey("o", key(), ctx({ selectedSlug: null }))).toEqual([
      { type: "showToast", message: "no profile slug available" },
    ]);
  });

  test("O opens the messenger thread when a conversation is selected", () => {
    expect(handleKey("O", key(), ctx())).toEqual([
      { type: "openUrl", url: "https://www.linkedin.com/messaging/thread/2-SYNTH1/" },
      { type: "showToast", message: "opened thread in LinkedIn" },
    ]);
    expect(handleKey("O", key(), ctx({ selectedConvId: null }))).toEqual([
      { type: "showToast", message: "no conversation selected" },
    ]);
  });

  test("g/G jump to the top and bottom of the filtered list", () => {
    expect(handleKey("g", key(), ctx())).toEqual([{ type: "setCursor", index: 0 }]);
    expect(handleKey("G", key(), ctx({ filteredCount: 3 }))).toEqual([
      { type: "setCursor", index: 2 },
    ]);
    expect(handleKey("G", key(), ctx({ filteredCount: 0 }))).toEqual([
      { type: "setCursor", index: 0 },
    ]);
  });

  test("j/k and arrows move the sidebar cursor", () => {
    expect(handleKey("j", key(), ctx())).toEqual([{ type: "moveCursor", delta: 1 }]);
    expect(handleKey("", key({ downArrow: true }), ctx())).toEqual([
      { type: "moveCursor", delta: 1 },
    ]);
    expect(handleKey("k", key(), ctx())).toEqual([{ type: "moveCursor", delta: -1 }]);
    expect(handleKey("", key({ upArrow: true }), ctx())).toEqual([
      { type: "moveCursor", delta: -1 },
    ]);
  });

  test("page keys scroll the thread", () => {
    expect(handleKey("", key({ pageDown: true }), ctx())).toEqual([
      { type: "scrollBy", delta: -10 },
    ]);
    expect(handleKey("", key({ pageUp: true }), ctx())).toEqual([{ type: "scrollBy", delta: 10 }]);
  });

  test("Enter opens the conversation under the cursor", () => {
    expect(handleKey("", key({ return: true }), ctx())).toEqual([
      { type: "openConversation", convId: "2-SYNTH2" },
    ]);
    expect(handleKey("", key({ return: true }), ctx({ cursorConvId: null }))).toEqual([]);
  });

  test("unbound keys fall through", () => {
    expect(handleKey("z", key(), ctx())).toEqual([]);
  });
});

describe("handleKey · text-entry modes", () => {
  test("search: Esc clears and returns to browse, Enter keeps the filter", () => {
    expect(handleKey("", key({ escape: true }), ctx({ mode: "search" }))).toEqual([
      { type: "setMode", mode: "browse" },
      { type: "clearSearch" },
    ]);
    expect(handleKey("", key({ return: true }), ctx({ mode: "search" }))).toEqual([
      { type: "setMode", mode: "browse" },
    ]);
    // TextInput owns characters.
    expect(handleKey("a", key(), ctx({ mode: "search" }))).toEqual([]);
  });

  test("compose: only Esc is handled", () => {
    expect(handleKey("", key({ escape: true }), ctx({ mode: "compose" }))).toEqual([
      { type: "setMode", mode: "browse" },
    ]);
    expect(handleKey("q", key(), ctx({ mode: "compose" }))).toEqual([]);
  });

  test("command: Esc clears the palette input", () => {
    expect(handleKey("", key({ escape: true }), ctx({ mode: "command" }))).toEqual([
      { type: "setMode", mode: "browse" },
      { type: "clearCommand" },
    ]);
    expect(handleKey("q", key(), ctx({ mode: "command" }))).toEqual([]);
  });

  test("new: Esc returns to browse", () => {
    expect(handleKey("", key({ escape: true }), ctx({ mode: "new" }))).toEqual([
      { type: "setMode", mode: "browse" },
    ]);
  });
});

describe("handleKey · help", () => {
  test("Esc, ? and q all close help", () => {
    for (const [input, k] of [
      ["", key({ escape: true })],
      ["?", key()],
      ["q", key()],
    ] as const) {
      expect(handleKey(input, k, ctx({ mode: "help" }))).toEqual([
        { type: "setMode", mode: "browse" },
      ]);
    }
    expect(handleKey("j", key(), ctx({ mode: "help" }))).toEqual([]);
  });
});

describe("handleKey · overlay modes own their keys", () => {
  test("templatePick, templateManage and reactionPick never act at App level", () => {
    for (const mode of ["templatePick", "templateManage", "reactionPick"] as const) {
      expect(handleKey("q", key(), ctx({ mode }))).toEqual([]);
      expect(handleKey("", key({ escape: true }), ctx({ mode }))).toEqual([]);
    }
  });
});

describe("handleKey · messageSelect", () => {
  test("Esc cancels and clears the message cursor", () => {
    expect(handleKey("", key({ escape: true }), ctx({ mode: "messageSelect" }))).toEqual([
      { type: "setMode", mode: "browse" },
      { type: "setMessageCursor", index: null },
    ]);
  });

  test("Enter opens the picker only on a valid message", () => {
    expect(
      handleKey("", key({ return: true }), ctx({ mode: "messageSelect", messageCursorIdx: 2 }))
    ).toEqual([{ type: "setMode", mode: "reactionPick" }]);
    expect(
      handleKey("", key({ return: true }), ctx({ mode: "messageSelect", messageCursorIdx: null }))
    ).toEqual([]);
    expect(
      handleKey(
        "",
        key({ return: true }),
        ctx({ mode: "messageSelect", messageCursorIdx: 5, messageCount: 5 })
      )
    ).toEqual([]);
  });

  test("j/k move the message cursor, g/G jump", () => {
    const c = ctx({ mode: "messageSelect", messageCount: 5, messageCursorIdx: 2 });
    expect(handleKey("j", key(), c)).toEqual([{ type: "moveMessageCursor", delta: 1 }]);
    expect(handleKey("k", key(), c)).toEqual([{ type: "moveMessageCursor", delta: -1 }]);
    expect(handleKey("g", key(), c)).toEqual([{ type: "setMessageCursor", index: 0 }]);
    expect(handleKey("G", key(), c)).toEqual([{ type: "setMessageCursor", index: 4 }]);
  });
});

describe("applyKeyAction", () => {
  test("forwards each action onto the matching dep", () => {
    const calls: unknown[][] = [];
    const record =
      (name: string) =>
      (...args: unknown[]) =>
        calls.push([name, ...args]);
    const deps: KeyActionDeps = {
      quit: record("quit"),
      setMode: record("setMode"),
      clearSearch: record("clearSearch"),
      clearCommand: record("clearCommand"),
      setCursor: record("setCursor"),
      moveCursor: record("moveCursor"),
      scrollBy: record("scrollBy"),
      setMessageCursor: record("setMessageCursor"),
      moveMessageCursor: record("moveMessageCursor"),
      openConversation: record("openConversation"),
      openUrl: record("openUrl"),
      showToast: record("showToast"),
      syncInbox: record("syncInbox"),
    };
    const actions: KeyAction[] = [
      { type: "quit" },
      { type: "setMode", mode: "help" },
      { type: "setCursor", index: 3 },
      { type: "moveMessageCursor", delta: -1 },
      { type: "openConversation", convId: "2-SYNTH1" },
      { type: "openUrl", url: "https://example.invalid/" },
      { type: "showToast", message: "hi" },
      { type: "syncInbox", opts: { from: "1d" } },
    ];
    for (const a of actions) applyKeyAction(a, deps);
    expect(calls).toEqual([
      ["quit"],
      ["setMode", "help"],
      ["setCursor", 3],
      ["moveMessageCursor", -1],
      ["openConversation", "2-SYNTH1"],
      ["openUrl", "https://example.invalid/"],
      ["showToast", "hi"],
      ["syncInbox", { from: "1d" }],
    ]);
  });
});
