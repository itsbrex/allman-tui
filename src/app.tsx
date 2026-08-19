import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/Composer.tsx";
import { Help } from "./components/Help.tsx";
import { NewConversation } from "./components/NewConversation.tsx";
import { ReactionPicker } from "./components/ReactionPicker.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { TemplateManager } from "./components/TemplateManager.tsx";
import { TemplatePicker } from "./components/TemplatePicker.tsx";
import { Thread } from "./components/Thread.tsx";
import { useListen } from "./hooks/use-listen.ts";
import { useMessageActions } from "./hooks/use-message-actions.ts";
import { useStore } from "./hooks/use-store.ts";
import { useSync } from "./hooks/use-sync.ts";
import { useTerminalSize } from "./hooks/use-terminal-size.ts";
import { useToast } from "./hooks/use-toast.ts";
import {
  enrichConnections,
  formatConnectionSummary,
  loadConnection,
  loadMessages,
  pullConnections,
  readAccountAuth,
  sendConnectionRequest,
} from "./lib/allman.ts";
import { executeCommand, parseCommand } from "./lib/commands.ts";
import { applyKeyAction, handleKey, type KeyActionDeps, type Mode } from "./lib/keymap.ts";
import { resolveNewConversationPick } from "./lib/new-conversation.ts";
import { openUrl } from "./lib/open-url.ts";
import { loadTemplates, saveTemplates, type Template } from "./lib/templates.ts";
import type { Account, SearchResult } from "./lib/types.ts";

export type { Mode };

type Props = { account: Account };

export function App({ account }: Props) {
  const { exit } = useApp();
  const { cols, rows } = useTerminalSize();

  const [mode, setMode] = useState<Mode>("browse");
  const [searchQuery, setSearchQuery] = useState("");
  const [composeText, setComposeText] = useState("");
  const [commandText, setCommandText] = useState("");
  // Index into `messages` for the react flow's message cursor. Null outside
  // the messageSelect/reactionPick modes.
  const [messageCursorIdx, setMessageCursorIdx] = useState<number | null>(null);

  const { toast, setToast, showToast, showToastRef } = useToast();

  // lastSyncAt is mirrored from AUTH.json — bump it whenever a sync run completes
  // so the freshness indicator updates without a full reload.
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(account.auth.lastSyncAt ?? null);
  const refreshAccountAuth = useCallback(() => {
    const auth = readAccountAuth(account.dir);
    if (auth?.lastSyncAt) setLastSyncAt(auth.lastSyncAt);
  }, [account.dir]);
  const refreshAuthRef = useRef(refreshAccountAuth);
  useEffect(() => {
    refreshAuthRef.current = refreshAccountAuth;
  }, [refreshAccountAuth]);

  const {
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
  } = useStore({ account, searchQuery, refreshAuthRef });

  // Quick-reply templates. Stored in ~/.config/allman-tui/templates.json —
  // TUI-local, not in the allman store, because templates are UX metadata
  // rather than LinkedIn state.
  const [templates, setTemplates] = useState<Template[]>(() => loadTemplates());
  const updateTemplates = useCallback(
    (next: Template[]) => {
      setTemplates(next);
      try {
        saveTemplates(next);
      } catch (e) {
        setToast(`failed to save templates: ${e instanceof Error ? e.message : e}`);
      }
    },
    [setToast]
  );

  // Tick every second so sub-minute relative times ("5s", "30s") progress
  // smoothly in the status bar. Ink re-renders are cheap and only the
  // StatusBar depends on this, so the cost is negligible.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { listenStatus, lastBeatAt, stopListen } = useListen({
    accountSlug: account.slug,
    reloadRef,
    showToastRef,
  });

  const { syncActivity, doSyncInbox, doSyncOne } = useSync({
    account,
    conversations,
    selectedConvId,
    lastSyncAt,
    reloadRef,
    showToastRef,
    showToast,
    refreshAccountAuth,
  });

  const { sending, reacting, doSend, doReact } = useMessageActions({
    account,
    conversations,
    selectedConvId,
    messages,
    messageCursorIdx,
    reload,
    showToast,
    setMode,
    setComposeText,
    setMessageCursorIdx,
  });

  // Reset the message cursor whenever the conversation changes so we don't
  // carry an index into a mismatched message list. Biome's exhaustive-deps
  // rule flags `selectedConvId` as "unused" inside the effect body, but we
  // genuinely want the effect to re-fire on every change — the identifier IS
  // the trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only dep
  useEffect(() => {
    setMessageCursorIdx(null);
  }, [selectedConvId]);

  // ----- New conversation pick -----
  const onPickNew = useCallback(
    (r: SearchResult) => {
      const pick = resolveNewConversationPick(r, conversations, account.dir);
      if (pick.kind === "open") {
        if (pick.cursorIdx !== null) {
          setCursorIdx(pick.cursorIdx);
          setScrollOffset(0);
        }
        setSelectedConvId(pick.convId);
        setMessages(pick.messages);
        setMode("browse");
        showToast(`opened ${r.name}`);
        return;
      }
      if (pick.kind === "draft") {
        setConversations((prev) => [pick.placeholder, ...prev]);
        setSelectedConvId(pick.placeholder.convId);
        setMessages([]);
        setCursorIdx(0);
        setMode("compose");
        showToast(`drafting to ${r.name}`);
        return;
      }
      showToast("can't open: no slug available");
    },
    [
      conversations,
      account.dir,
      showToast,
      setConversations,
      setCursorIdx,
      setMessages,
      setScrollOffset,
      setSelectedConvId,
    ]
  );

  const quit = useCallback(() => {
    stopListen();
    exit();
  }, [stopListen, exit]);

  const conv = conversations.find((c) => c.convId === selectedConvId) ?? null;

  // ----- Keybindings -----
  // Per-mode key logic lives in lib/keymap.ts; this wires its actions onto
  // the app's setters.
  const keyDeps: KeyActionDeps = {
    quit,
    setMode,
    clearSearch: () => setSearchQuery(""),
    clearCommand: () => setCommandText(""),
    setCursor: setCursorIdx,
    moveCursor: (delta) =>
      setCursorIdx((c) =>
        delta > 0 ? Math.min(filtered.length - 1, c + delta) : Math.max(0, c + delta)
      ),
    scrollBy: (delta) => setScrollOffset((s) => Math.max(0, s + delta)),
    setMessageCursor: setMessageCursorIdx,
    moveMessageCursor: (delta) =>
      setMessageCursorIdx((c) => {
        const last = messages.length - 1;
        if (c === null) return last;
        return delta > 0 ? Math.min(last, c + delta) : Math.max(0, c + delta);
      }),
    openConversation: (convId) => {
      setSelectedConvId(convId);
      setMessages(loadMessages(account.dir, convId));
      setScrollOffset(0);
    },
    openUrl,
    showToast,
    syncInbox: (opts) => void doSyncInbox(opts),
  };

  useInput(
    (input, key) => {
      const actions = handleKey(input, key, {
        mode,
        selectedConvId,
        selectedSlug: conv?.slug ?? null,
        cursorConvId: filtered[cursorIdx]?.convId ?? null,
        filteredCount: filtered.length,
        messageCount: messages.length,
        messageCursorIdx,
      });
      for (const action of actions) applyKeyAction(action, keyDeps);
    },
    {
      isActive:
        mode !== "new" &&
        mode !== "templatePick" &&
        mode !== "templateManage" &&
        mode !== "reactionPick",
    }
  );

  // ----- Command palette runner -----
  const runCommand = useCallback(
    (raw: string) => {
      setCommandText("");
      setMode("browse");
      const selected = conversations.find((c) => c.convId === selectedConvId);
      executeCommand(parseCommand(raw), {
        quit,
        reload,
        showToast,
        setMode,
        syncInbox: (opts) => void doSyncInbox(opts),
        syncConversation: (target) => void doSyncOne(target),
        backfillTarget: selectedConvId ? (selected?.slug ?? selectedConvId) : null,
        pullConnections,
        enrichConnections,
        sendConnectionRequest,
      });
    },
    [conversations, selectedConvId, quit, reload, showToast, doSyncInbox, doSyncOne]
  );

  // ----- Layout -----
  const sidebarWidth = Math.max(28, Math.min(42, Math.floor(cols * 0.32)));
  const threadWidth = cols - sidebarWidth - 1; // 1 col divider
  const statusHeight = 1;
  const pickerHeight = Math.min(10, Math.max(5, Math.floor(rows * 0.3)));
  const composerHeight = mode === "reactionPick" ? pickerHeight : 1;
  const dividerHeight = 1;
  const bodyHeight = Math.max(8, rows - statusHeight - composerHeight - dividerHeight - 1);

  // Enrichment summary for the open thread, read straight from the
  // connections store. Cheap (one file read) and re-evaluated when the
  // selection changes or a `:enrich` run triggers a reload.
  const profileSummary = useMemo(() => {
    const key = conv?.slug ?? conv?.profileId;
    if (!key) return null;
    return formatConnectionSummary(loadConnection(account.dir, key));
  }, [conv?.slug, conv?.profileId, account.dir]);

  const statusBar = (
    <StatusBar
      mode={mode}
      accountSlug={account.slug}
      totalConvs={conversations.length}
      unreadConvs={conversations.filter((c) => c.unreadCount > 0).length}
      listenStatus={listenStatus}
      lastBeatAt={lastBeatAt}
      lastSyncAt={lastSyncAt}
      syncActivity={syncActivity}
      toast={toast}
      width={cols}
    />
  );

  // Modal: full-screen overlay for new conversation and help.
  if (mode === "help") {
    return (
      <Box flexDirection="column" width={cols} height={rows}>
        <Help width={cols} height={rows - statusHeight} />
        {statusBar}
      </Box>
    );
  }

  if (mode === "new") {
    return (
      <Box flexDirection="column" width={cols} height={rows}>
        <NewConversation
          width={cols}
          height={rows - statusHeight}
          onCancel={() => setMode("browse")}
          onPick={onPickNew}
        />
        {statusBar}
      </Box>
    );
  }

  if (mode === "templatePick") {
    return (
      <Box flexDirection="column" width={cols} height={rows}>
        <TemplatePicker
          templates={templates}
          conv={conv}
          width={cols}
          height={rows - statusHeight}
          onCancel={() => setMode("browse")}
          onManage={() => setMode("templateManage")}
          onPick={(renderedBody) => {
            setComposeText(renderedBody);
            setMode("compose");
          }}
        />
        {statusBar}
      </Box>
    );
  }

  // reactionPick is rendered inline in the main layout (below).

  if (mode === "templateManage") {
    return (
      <Box flexDirection="column" width={cols} height={rows}>
        <TemplateManager
          templates={templates}
          width={cols}
          height={rows - statusHeight}
          onClose={() => setMode("browse")}
          onChange={updateTemplates}
        />
        {statusBar}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      {/* main split */}
      <Box width={cols} height={bodyHeight}>
        <Sidebar
          conversations={conversations}
          filtered={filtered}
          selectedConvId={selectedConvId}
          cursorIdx={cursorIdx}
          searchActive={mode === "search"}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          width={sidebarWidth}
          height={bodyHeight}
          lastMessages={lastMessages}
        />
        <Box width={1} height={bodyHeight} flexDirection="column">
          <Text dimColor>{"│\n".repeat(bodyHeight).trimEnd()}</Text>
        </Box>
        <Thread
          conversation={conv}
          profileSummary={profileSummary}
          messages={messages}
          width={threadWidth}
          height={bodyHeight}
          scrollOffset={scrollOffset}
          selectedMessageUrn={
            (mode === "messageSelect" || mode === "reactionPick") && messageCursorIdx !== null
              ? (messages[messageCursorIdx]?.urn ?? null)
              : null
          }
        />
      </Box>

      {/* divider */}
      <Box width={cols} height={1}>
        <Text dimColor>{"─".repeat(cols)}</Text>
      </Box>

      {/* composer or command palette */}
      <Box width={cols} height={composerHeight}>
        {mode === "command" ? (
          <Box width={cols} paddingX={1}>
            <Text color="cyanBright">: </Text>
            <Box flexGrow={1}>
              <TextInput
                value={commandText}
                onChange={setCommandText}
                onSubmit={runCommand}
                focus
                placeholder="sync · sync <slug> · reload · help · quit"
              />
            </Box>
          </Box>
        ) : mode === "reactionPick" ? (
          (() => {
            const targetMsg = messageCursorIdx !== null ? messages[messageCursorIdx] : null;
            if (!targetMsg) return null;
            return (
              <ReactionPicker
                message={targetMsg}
                width={cols}
                height={composerHeight}
                onCancel={() => setMode("messageSelect")}
                onPick={(emoji, unreact) => {
                  if (!reacting) void doReact(emoji, unreact);
                }}
              />
            );
          })()
        ) : mode === "messageSelect" ? (
          <Box width={cols} paddingX={1}>
            <Text color="yellowBright">react</Text>
            <Text dimColor> · j/k or ↑/↓ pick message · ↵ open picker · Esc cancel</Text>
          </Box>
        ) : (
          <Composer
            recipientName={conv?.firstName || conv?.name || null}
            text={composeText}
            onChange={setComposeText}
            onSubmit={(v) => {
              if (v.trim()) void doSend(v.trim());
            }}
            active={mode === "compose"}
            sending={sending}
            width={cols}
          />
        )}
      </Box>

      {/* status */}
      {statusBar}
    </Box>
  );
}
