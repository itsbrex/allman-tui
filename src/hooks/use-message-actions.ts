import { useCallback, useState } from "react";
import { reactToMessage, sendMessage } from "../lib/allman.ts";
import type { Mode } from "../lib/keymap.ts";
import type { Account, Conversation, Message } from "../lib/types.ts";

/**
 * Outbound message actions — send and react. Both shell out to the binary,
 * which owns rate limiting, pre-send sync, duplicate detection, and the git
 * commit; the TUI only reloads the store afterwards.
 */
export function useMessageActions(opts: {
  account: Account;
  conversations: Conversation[];
  selectedConvId: string | null;
  messages: Message[];
  messageCursorIdx: number | null;
  reload: () => void;
  showToast: (msg: string, ms?: number) => void;
  setMode: (mode: Mode) => void;
  setComposeText: (text: string) => void;
  setMessageCursorIdx: (idx: number | null) => void;
}): {
  sending: boolean;
  reacting: boolean;
  doSend: (body: string) => Promise<void>;
  doReact: (emoji: string, unreact: boolean) => Promise<void>;
} {
  const {
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
  } = opts;

  const [sending, setSending] = useState(false);
  const [reacting, setReacting] = useState(false);

  // ----- Send -----
  const doSend = useCallback(
    async (body: string) => {
      const conv = conversations.find((c) => c.convId === selectedConvId);
      if (!conv) {
        showToast("no conversation selected");
        return;
      }
      const target = conv.slug || conv.backendUrn || conv.convId;
      setSending(true);
      try {
        await sendMessage(target, body, { account: account.slug });
        setComposeText("");
        setMode("browse");
        showToast("message sent");
        // give the CLI a moment to flush + commit, then reload
        setTimeout(reload, 500);
      } catch (e) {
        showToast(`send failed: ${e instanceof Error ? e.message : e}`, 6000);
      } finally {
        setSending(false);
      }
    },
    [conversations, selectedConvId, account.slug, reload, showToast, setComposeText, setMode]
  );

  // ----- React -----
  const doReact = useCallback(
    async (emoji: string, unreact: boolean) => {
      const conv = conversations.find((c) => c.convId === selectedConvId);
      if (!conv) {
        showToast("no conversation selected");
        return;
      }
      if (messageCursorIdx === null) {
        showToast("no message selected");
        return;
      }
      const msg = messages[messageCursorIdx];
      if (!msg) {
        showToast("no message selected");
        return;
      }
      const target = conv.slug || conv.backendUrn || conv.convId;
      setReacting(true);
      try {
        await reactToMessage(target, emoji, {
          account: account.slug,
          message: msg.urn,
          unreact,
        });
        showToast(unreact ? `removed ${emoji}` : `reacted ${emoji}`);
        // Let the CLI finish its git commit, then reload so the updated
        // reactions surface without waiting for the next listen heartbeat.
        setTimeout(reload, 400);
      } catch (e) {
        showToast(`react failed: ${e instanceof Error ? e.message : e}`, 6000);
      } finally {
        setReacting(false);
        setMode("browse");
        setMessageCursorIdx(null);
      }
    },
    [
      conversations,
      selectedConvId,
      messages,
      messageCursorIdx,
      account.slug,
      reload,
      showToast,
      setMode,
      setMessageCursorIdx,
    ]
  );

  return { sending, reacting, doSend, doReact };
}
