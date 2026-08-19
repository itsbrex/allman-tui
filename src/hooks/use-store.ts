import { watch } from "node:fs";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadConversations, loadLastMessage, loadMessages } from "../lib/allman.ts";
import type { Account, Conversation, Message } from "../lib/types.ts";

/**
 * All read-side store state: the conversation list, the open thread, the
 * sidebar cursor, and the reload path that re-reads everything from disk.
 * Reads parse the store directly (per-keystroke navigation can't afford a
 * subprocess); writes stay with the binary via the callbacks in app.tsx.
 */
export function useStore(opts: {
  account: Account;
  searchQuery: string;
  /** Latest AUTH.json refresher, re-run when the fs watcher fires. */
  refreshAuthRef: RefObject<() => void>;
}): {
  conversations: Conversation[];
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  lastMessages: Map<string, Message | null>;
  filtered: Conversation[];
  cursorIdx: number;
  setCursorIdx: Dispatch<SetStateAction<number>>;
  selectedConvId: string | null;
  setSelectedConvId: Dispatch<SetStateAction<string | null>>;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  scrollOffset: number;
  setScrollOffset: Dispatch<SetStateAction<number>>;
  reload: () => void;
  reloadRef: RefObject<() => void>;
} {
  const { account, searchQuery, refreshAuthRef } = opts;

  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations(account.dir)
  );
  const [lastMessages, setLastMessages] = useState<Map<string, Message | null>>(() => {
    const m = new Map<string, Message | null>();
    for (const c of loadConversations(account.dir)) {
      m.set(c.convId, loadLastMessage(account.dir, c.convId));
    }
    return m;
  });

  const [cursorIdx, setCursorIdx] = useState(0);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    conversations[0]?.convId ?? null
  );
  const [messages, setMessages] = useState<Message[]>(() =>
    conversations[0] ? loadMessages(account.dir, conversations[0].convId) : []
  );
  const [scrollOffset, setScrollOffset] = useState(0);

  // ----- Filtering -----
  const filtered = useMemo<Conversation[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const hay = `${c.name || ""}|${c.slug || ""}|${c.headline || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, searchQuery]);

  // Keep cursor in bounds.
  useEffect(() => {
    if (cursorIdx > filtered.length - 1) setCursorIdx(Math.max(0, filtered.length - 1));
  }, [filtered.length, cursorIdx]);

  // When the cursor in the sidebar changes (in browse), load the corresponding
  // conversation. We update selectedConvId on Enter, but we also auto-preview.
  const previewConv = filtered[cursorIdx] ?? null;
  useEffect(() => {
    if (!previewConv) return;
    if (previewConv.convId === selectedConvId) return;
    setSelectedConvId(previewConv.convId);
    setMessages(loadMessages(account.dir, previewConv.convId));
    setScrollOffset(0);
  }, [previewConv, selectedConvId, account.dir]);

  // ----- Reload from disk -----
  const reload = useCallback(() => {
    const next = loadConversations(account.dir);
    setConversations(next);
    const lm = new Map<string, Message | null>();
    for (const c of next) lm.set(c.convId, loadLastMessage(account.dir, c.convId));
    setLastMessages(lm);
    if (selectedConvId) {
      setMessages(loadMessages(account.dir, selectedConvId));
      // Keep cursor tracking the selected conversation after re-sort.
      // Without this, sending a message (which bumps lastActivityAt → index 0)
      // leaves cursorIdx at the old position, and the auto-preview effect
      // overwrites selectedConvId with whatever now sits at that index.
      const idx = next.findIndex((c) => c.convId === selectedConvId);
      if (idx >= 0) setCursorIdx(idx);
    }
  }, [account.dir, selectedConvId]);

  // Long-lived subscribers (fs watch, listen, sync progress) go through a
  // stable ref so they don't have to depend on the (re-created on every
  // render) reload callback.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  // ----- Filesystem watch -----
  // Catches out-of-band writes to the store — e.g. the user runs `allman sync`
  // or `allman send` from another terminal while the TUI is open. Listen events
  // and our own sync handlers already cover the in-process paths; this just
  // closes the gap for external CLI invocations. Debounce coalesces bursts
  // (e.g. a sync writing many messages in quick succession) into a single
  // reload, and overlaps harmlessly with the explicit reload calls elsewhere.
  useEffect(() => {
    let debounceT: ReturnType<typeof setTimeout> | null = null;
    let watcher: ReturnType<typeof watch> | null = null;
    try {
      watcher = watch(account.dir, { recursive: true }, () => {
        if (debounceT) clearTimeout(debounceT);
        debounceT = setTimeout(() => {
          debounceT = null;
          reloadRef.current();
          refreshAuthRef.current();
        }, 250);
      });
      watcher.on("error", () => {
        // swallow — fs.watch can be flaky on some platforms; the listen
        // subprocess + manual `R` are the safety net.
      });
    } catch {
      // ignore — recursive watch may not be supported (linux without inotify, etc.)
    }
    return () => {
      if (debounceT) clearTimeout(debounceT);
      try {
        watcher?.close();
      } catch {
        // ignore
      }
    };
  }, [account.dir, refreshAuthRef]);

  return {
    conversations,
    setConversations,
    lastMessages,
    filtered,
    cursorIdx,
    setCursorIdx,
    selectedConvId,
    setSelectedConvId,
    messages,
    setMessages,
    scrollOffset,
    setScrollOffset,
    reload,
    reloadRef,
  };
}
