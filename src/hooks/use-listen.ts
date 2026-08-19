import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type ListenHandle, startListen } from "../lib/allman.ts";
import type { ListenEvent } from "../lib/types.ts";

export type ListenStatus = "starting" | "connected" | "disconnected" | "error" | "off";

/**
 * The `allman listen` subprocess lifecycle. Best-effort by design: if the
 * stream dies the status dot goes red and everything else keeps working — the
 * store stays the source of truth. Opt-out via ALLMAN_TUI_LISTEN=0 (or
 * =false). Enabled by default so the TUI behaves like a real messenger inbox
 * out of the box.
 *
 * Tracks listen freshness so the status bar can show a meaningful "live" dot.
 * `lastBeatAt` ticks on every heartbeat, message, or read receipt — anything
 * that proves the SSE channel is still flowing.
 */
export function useListen(opts: {
  accountSlug: string;
  reloadRef: RefObject<() => void>;
  showToastRef: RefObject<(msg: string, ms?: number) => void>;
}): {
  listenStatus: ListenStatus;
  lastBeatAt: number | null;
  stopListen: () => void;
} {
  const { accountSlug, reloadRef, showToastRef } = opts;
  const [listenStatus, setListenStatus] = useState<ListenStatus>("off");
  const [lastBeatAt, setLastBeatAt] = useState<number | null>(null);
  const listenRef = useRef<ListenHandle | null>(null);

  useEffect(() => {
    const flag = (process.env.ALLMAN_TUI_LISTEN || "").toLowerCase();
    if (flag === "0" || flag === "false" || flag === "off") {
      setListenStatus("off");
      return;
    }
    listenRef.current = startListen(
      (ev: ListenEvent) => {
        // Anything coming through proves the channel is alive — heartbeats
        // arrive every ~30s so this doubles as a freshness signal.
        setLastBeatAt(Date.now());
        if (
          ev.event === "message.received" ||
          ev.event === "message.sent" ||
          ev.event === "read_receipt" ||
          ev.event === "reaction"
        ) {
          // small delay so the JSONL flush completes
          setTimeout(() => reloadRef.current(), 350);
          if (ev.event === "message.received" && ev.from?.name) {
            showToastRef.current(`new message from ${ev.from.name}`);
          }
        }
      },
      (status, info) => {
        setListenStatus(status);
        if (status === "connected") setLastBeatAt(Date.now());
        if (status === "error" && info) showToastRef.current(`listen error: ${info}`);
      },
      { account: accountSlug }
    );
    return () => {
      listenRef.current?.stop();
      listenRef.current = null;
    };
  }, [accountSlug, reloadRef, showToastRef]);

  const stopListen = useCallback(() => {
    listenRef.current?.stop();
  }, []);

  return { listenStatus, lastBeatAt, stopListen };
}
