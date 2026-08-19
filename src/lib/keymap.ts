// The TUI's modal keymap, split out of app.tsx so per-mode key handling is a
// pure function: current mode + a snapshot of app state in, a list of actions
// out. `applyKeyAction` translates those actions onto the setters the App
// component injects, keeping every state transition in one auditable place.

export type Mode =
  | "browse"
  | "compose"
  | "search"
  | "new"
  | "command"
  | "help"
  | "templatePick"
  | "templateManage"
  | "messageSelect"
  | "reactionPick";

/** The subset of ink's `useInput` key object the keymap reads. */
export type KeyInput = {
  escape: boolean;
  return: boolean;
  upArrow: boolean;
  downArrow: boolean;
  pageUp: boolean;
  pageDown: boolean;
};

/** Snapshot of the app state a key handler is allowed to see. */
export type KeyContext = {
  mode: Mode;
  selectedConvId: string | null;
  /** Slug of the selected conversation, for profile-opening keys. */
  selectedSlug: string | null;
  /** convId under the sidebar cursor (after filtering), if any. */
  cursorConvId: string | null;
  filteredCount: number;
  messageCount: number;
  messageCursorIdx: number | null;
};

export type KeyAction =
  | { type: "quit" }
  | { type: "setMode"; mode: Mode }
  | { type: "clearSearch" }
  | { type: "clearCommand" }
  | { type: "setCursor"; index: number }
  | { type: "moveCursor"; delta: number }
  | { type: "scrollBy"; delta: number }
  | { type: "setMessageCursor"; index: number | null }
  | { type: "moveMessageCursor"; delta: number }
  | { type: "openConversation"; convId: string }
  | { type: "openUrl"; url: string }
  | { type: "showToast"; message: string }
  | { type: "syncInbox"; opts: { from?: string; resync?: boolean } };

/** Setters the App component wires `KeyAction`s onto. */
export type KeyActionDeps = {
  quit(): void;
  setMode(mode: Mode): void;
  clearSearch(): void;
  clearCommand(): void;
  setCursor(index: number): void;
  moveCursor(delta: number): void;
  scrollBy(delta: number): void;
  setMessageCursor(index: number | null): void;
  moveMessageCursor(delta: number): void;
  openConversation(convId: string): void;
  openUrl(url: string): void;
  showToast(message: string): void;
  syncInbox(opts: { from?: string; resync?: boolean }): void;
};

export function applyKeyAction(action: KeyAction, deps: KeyActionDeps): void {
  switch (action.type) {
    case "quit":
      deps.quit();
      return;
    case "setMode":
      deps.setMode(action.mode);
      return;
    case "clearSearch":
      deps.clearSearch();
      return;
    case "clearCommand":
      deps.clearCommand();
      return;
    case "setCursor":
      deps.setCursor(action.index);
      return;
    case "moveCursor":
      deps.moveCursor(action.delta);
      return;
    case "scrollBy":
      deps.scrollBy(action.delta);
      return;
    case "setMessageCursor":
      deps.setMessageCursor(action.index);
      return;
    case "moveMessageCursor":
      deps.moveMessageCursor(action.delta);
      return;
    case "openConversation":
      deps.openConversation(action.convId);
      return;
    case "openUrl":
      deps.openUrl(action.url);
      return;
    case "showToast":
      deps.showToast(action.message);
      return;
    case "syncInbox":
      deps.syncInbox(action.opts);
      return;
  }
}

/**
 * Map one keypress to actions. Mode-specific overrides come first; an empty
 * list means the key is not handled at this level (TextInput or an overlay's
 * own useInput picks it up instead).
 */
export function handleKey(input: string, key: KeyInput, ctx: KeyContext): KeyAction[] {
  switch (ctx.mode) {
    case "search":
      if (key.escape) return [{ type: "setMode", mode: "browse" }, { type: "clearSearch" }];
      if (key.return) return [{ type: "setMode", mode: "browse" }];
      return []; // TextInput handles characters
    case "compose":
      if (key.escape) return [{ type: "setMode", mode: "browse" }];
      return []; // TextInput handles characters; submit fires onSubmit
    case "command":
      if (key.escape) return [{ type: "setMode", mode: "browse" }, { type: "clearCommand" }];
      return [];
    case "new":
      if (key.escape) return [{ type: "setMode", mode: "browse" }];
      return [];
    case "help":
      if (key.escape || input === "?" || input === "q") {
        return [{ type: "setMode", mode: "browse" }];
      }
      return [];
    case "templatePick":
    case "templateManage":
      // Both overlays own their own keybindings via the embedded useInput.
      // We only need to make sure App-level keys don't fire underneath.
      return [];
    case "reactionPick":
      // ReactionPicker owns its own keybindings.
      return [];
    case "messageSelect":
      return handleMessageSelectKey(input, key, ctx);
    case "browse":
      return handleBrowseKey(input, key, ctx);
  }
}

function handleMessageSelectKey(input: string, key: KeyInput, ctx: KeyContext): KeyAction[] {
  if (key.escape) {
    return [
      { type: "setMode", mode: "browse" },
      { type: "setMessageCursor", index: null },
    ];
  }
  if (key.return) {
    if (
      ctx.messageCursorIdx !== null &&
      ctx.messageCursorIdx >= 0 &&
      ctx.messageCursorIdx < ctx.messageCount
    ) {
      return [{ type: "setMode", mode: "reactionPick" }];
    }
    return [];
  }
  // j = newer (increment), k = older (decrement). Messages are sorted
  // oldest-first so the newest sits at the last index.
  if (key.downArrow || input === "j") return [{ type: "moveMessageCursor", delta: 1 }];
  if (key.upArrow || input === "k") return [{ type: "moveMessageCursor", delta: -1 }];
  if (input === "g") return [{ type: "setMessageCursor", index: 0 }];
  if (input === "G") return [{ type: "setMessageCursor", index: ctx.messageCount - 1 }];
  return [];
}

function handleBrowseKey(input: string, key: KeyInput, ctx: KeyContext): KeyAction[] {
  if (input === "q") return [{ type: "quit" }];
  if (input === "?") return [{ type: "setMode", mode: "help" }];
  if (input === "/") return [{ type: "setMode", mode: "search" }];
  if (input === "n") return [{ type: "setMode", mode: "new" }];
  if (input === "i") {
    return ctx.selectedConvId ? [{ type: "setMode", mode: "compose" }] : [];
  }
  if (input === "x") {
    // Start a reaction flow: select a message, then pick an emoji.
    if (!ctx.selectedConvId) return [{ type: "showToast", message: "select a conversation first" }];
    if (ctx.messageCount === 0) return [{ type: "showToast", message: "no messages to react to" }];
    return [
      { type: "setMessageCursor", index: ctx.messageCount - 1 },
      { type: "setMode", mode: "messageSelect" },
    ];
  }
  if (input === "t") {
    // Quick-reply picker. Requires a selected conversation so the
    // rendered preview can substitute {firstName} etc.
    if (!ctx.selectedConvId) return [{ type: "showToast", message: "select a conversation first" }];
    return [{ type: "setMode", mode: "templatePick" }];
  }
  if (input === "T") return [{ type: "setMode", mode: "templateManage" }];
  if (input === ":") return [{ type: "setMode", mode: "command" }];
  if (input === "r") {
    // Manual sync. Force a 1-day window instead of inheriting the CLI's
    // lastSyncAt default — avoids missing messages sent during brief
    // listen-subprocess disconnects where lastSyncAt has advanced past
    // the message we actually care about.
    return [{ type: "syncInbox", opts: { from: "1d" } }];
  }
  if (input === "R") {
    // Full re-sync over a generous 7-day window. Bypasses knownNewestAt
    // dedup so all fetched messages are upserted — heals stale reactions,
    // parser fixes, and anything listen missed during recent outages.
    return [{ type: "syncInbox", opts: { from: "7d", resync: true } }];
  }
  if (input === "o") {
    // Open the contact's LinkedIn profile in the browser.
    if (ctx.selectedSlug) {
      return [
        { type: "openUrl", url: `https://www.linkedin.com/in/${ctx.selectedSlug}/` },
        { type: "showToast", message: `opened ${ctx.selectedSlug}'s profile` },
      ];
    }
    return [{ type: "showToast", message: "no profile slug available" }];
  }
  if (input === "O") {
    // Open the LinkedIn messenger thread in the browser.
    if (ctx.selectedConvId) {
      return [
        {
          type: "openUrl",
          url: `https://www.linkedin.com/messaging/thread/${ctx.selectedConvId}/`,
        },
        { type: "showToast", message: "opened thread in LinkedIn" },
      ];
    }
    return [{ type: "showToast", message: "no conversation selected" }];
  }
  if (input === "g") return [{ type: "setCursor", index: 0 }];
  if (input === "G") return [{ type: "setCursor", index: Math.max(0, ctx.filteredCount - 1) }];
  if (key.downArrow || input === "j") return [{ type: "moveCursor", delta: 1 }];
  if (key.upArrow || input === "k") return [{ type: "moveCursor", delta: -1 }];
  if (key.pageDown) return [{ type: "scrollBy", delta: -10 }];
  if (key.pageUp) return [{ type: "scrollBy", delta: 10 }];
  if (key.return) {
    // open the conversation under the cursor (already auto-previewed,
    // but Enter forces selection + scroll reset).
    if (ctx.cursorConvId) return [{ type: "openConversation", convId: ctx.cursorConvId }];
    return [];
  }
  return [];
}
