import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { SyncActivity } from "../components/StatusBar.tsx";
import { type SyncEvent, syncConversation, syncInbox } from "../lib/allman.ts";
import type { Account, Conversation } from "../lib/types.ts";

export type SyncInboxOpts = {
  from?: string;
  to?: string;
  limit?: number;
  quiet?: boolean;
  resync?: boolean;
};

/**
 * Sync orchestration: streaming inbox syncs, per-conversation backfills, the
 * launch auto-sync, and the auto-backfill that fires the first time a
 * conversation is opened. All writes go through the binary — this hook only
 * threads its NDJSON progress events into status-bar state.
 */
export function useSync(opts: {
  account: Account;
  conversations: Conversation[];
  selectedConvId: string | null;
  /** lastSyncAt mirrored from AUTH.json — read once at mount to size the launch sync. */
  lastSyncAt: string | null;
  reloadRef: RefObject<() => void>;
  showToastRef: RefObject<(msg: string, ms?: number) => void>;
  showToast: (msg: string, ms?: number) => void;
  refreshAccountAuth: () => void;
}): {
  syncActivity: SyncActivity | null;
  doSyncInbox: (opts?: SyncInboxOpts) => Promise<void>;
  doSyncOne: (target: string, opts?: { quiet?: boolean; limit?: number }) => Promise<void>;
} {
  const {
    account,
    conversations,
    selectedConvId,
    lastSyncAt,
    reloadRef,
    showToastRef,
    showToast,
    refreshAccountAuth,
  } = opts;

  // Live sync activity. Multi-account aware: keyed by account slug so future
  // multi-account UIs can show one in the foreground while others run in the
  // background. The current single-account TUI just reads activityByAccount[account.slug].
  const [activityByAccount, setActivityByAccount] = useState<Record<string, SyncActivity | null>>(
    {}
  );
  const syncActivity = activityByAccount[account.slug] ?? null;
  const setSyncActivity = useCallback((slug: string, next: SyncActivity | null) => {
    setActivityByAccount((prev) => {
      if (next === null && !(slug in prev)) return prev;
      return { ...prev, [slug]: next };
    });
  }, []);

  // Backfill bookkeeping — which conversations have already been auto-backfilled
  // this session, and which is currently in flight (so we don't double-trigger).
  const backfilledRef = useRef<Set<string>>(new Set());
  const backfillingRef = useRef<Set<string>>(new Set());

  // Streaming sync — subscribes to NDJSON progress events from `allman sync --json`
  // and threads them through into the status bar so the user sees live counts.
  const doSyncInbox = useCallback(
    async (opts: SyncInboxOpts = {}) => {
      if (syncActivity) return;
      const slug = account.slug;
      const startActivity: SyncActivity = {
        scope: "inbox",
        label: "inbox",
        messagesFetched: 0,
        conversationsSeen: 0,
      };
      setSyncActivity(slug, startActivity);
      if (!opts.quiet) showToast("syncing inbox…", 60_000);

      // Per-conversation message tallies, so the running total reflects the
      // sum across all conversations seen this run rather than the latest
      // page count alone.
      const perConv = new Map<string, number>();
      try {
        await syncInbox({
          account: slug,
          from: opts.from,
          to: opts.to,
          limit: opts.limit,
          resync: opts.resync,
          onEvent: (ev: SyncEvent) => {
            if (ev.event === "sync.conversation") {
              setSyncActivity(slug, {
                scope: "inbox",
                label: ev.slug ?? ev.name ?? "inbox",
                messagesFetched: Array.from(perConv.values()).reduce((a, b) => a + b, 0),
                conversationsSeen: ev.conversationsSeen,
              });
            } else if (ev.event === "sync.conversation.progress") {
              perConv.set(ev.convId, ev.messagesFetched);
              const total = Array.from(perConv.values()).reduce((a, b) => a + b, 0);
              setSyncActivity(slug, {
                scope: "inbox",
                label: ev.slug ?? "inbox",
                messagesFetched: total,
                conversationsSeen: perConv.size,
              });
              // Pull the new messages onto the screen as we go.
              reloadRef.current();
            } else if (ev.event === "sync.complete") {
              if (!opts.quiet) {
                showToast(`synced ${ev.conversationsSynced ?? 0}c · ${ev.messagesSynced} new msgs`);
              }
            }
          },
        });
        reloadRef.current();
        refreshAccountAuth();
      } catch (e) {
        showToast(`sync failed: ${e instanceof Error ? e.message : e}`, 6000);
      } finally {
        setSyncActivity(slug, null);
      }
    },
    [account.slug, refreshAccountAuth, reloadRef, setSyncActivity, showToast, syncActivity]
  );

  const doSyncOne = useCallback(
    async (target: string, opts: { quiet?: boolean; limit?: number } = {}) => {
      const slug = account.slug;
      // Don't start a backfill on top of an existing one for the same conv —
      // but allow it concurrent with an inbox sync.
      const key = `${slug}:${target}`;
      if (backfillingRef.current.has(key)) return;
      backfillingRef.current.add(key);

      const start: SyncActivity = {
        scope: "conversation",
        label: target,
        messagesFetched: 0,
      };
      setSyncActivity(slug, start);
      if (!opts.quiet) showToast(`backfilling ${target}…`, 60_000);

      try {
        await syncConversation(target, {
          account: slug,
          limit: opts.limit,
          onEvent: (ev: SyncEvent) => {
            if (ev.event === "sync.conversation.progress") {
              setSyncActivity(slug, {
                scope: "conversation",
                label: ev.slug ?? target,
                messagesFetched: ev.messagesFetched,
              });
              reloadRef.current();
            } else if (ev.event === "sync.complete") {
              if (!opts.quiet) {
                showToast(`backfill complete: ${ev.messagesSynced} msgs`);
              }
            }
          },
        });
        reloadRef.current();
        refreshAccountAuth();
        backfilledRef.current.add(key);
      } catch (e) {
        if (!opts.quiet) {
          showToast(`backfill failed: ${e instanceof Error ? e.message : e}`, 6000);
        }
      } finally {
        backfillingRef.current.delete(key);
        setSyncActivity(slug, null);
      }
    },
    [account.slug, refreshAccountAuth, reloadRef, setSyncActivity, showToast]
  );

  // ----- Auto-sync on every launch -----
  // Pull inbox updates from LinkedIn once on mount so the user never has to
  // hit `r` manually just to catch up after reopening. The TUI is a pure
  // viewer — it does not extend the sync window or otherwise second-guess
  // the CLI. Fresh accounts (no lastSyncAt) get a one-month backfill so the
  // inbox isn't empty; everything else rides on the CLI's incremental logic.
  const doSyncInboxRef = useRef(doSyncInbox);
  useEffect(() => {
    doSyncInboxRef.current = doSyncInbox;
  }, [doSyncInbox]);
  const autoSyncedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run-once-on-mount
  useEffect(() => {
    if (autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    const freshAccount = !lastSyncAt;
    if (freshAccount) {
      showToastRef.current("first run — pulling the last month from LinkedIn…", 60_000);
      void doSyncInboxRef.current({ from: "1mo", quiet: true });
    } else {
      // On launch, always widen to a 1-day window so we pull anything listen
      // might have missed during recent disconnects (lastSyncAt can otherwise
      // be seconds-fresh and exclude real backlog).
      void doSyncInboxRef.current({ from: "1d", quiet: true });
    }
  }, []);

  // ----- Auto-backfill on conversation open -----
  // The first time the user opens a conversation that hasn't been fully
  // backfilled, kick off a single-conversation sync to walk it back to the
  // first message. Backfilling is rate-limited inside the CLI; concurrent
  // backfills queue at the download limiter.
  useEffect(() => {
    const conv = conversations.find((c) => c.convId === selectedConvId);
    if (!conv) return;
    if (conv.convId.startsWith("pending:")) return; // placeholder, not in store yet
    if (conv.syncState?.fullyBackfilled) return;
    const target = conv.slug ?? conv.convId;
    const key = `${account.slug}:${target}`;
    if (backfilledRef.current.has(key)) return;
    if (backfillingRef.current.has(key)) return;
    void doSyncOne(target, { quiet: true });
  }, [selectedConvId, conversations, account.slug, doSyncOne]);

  return { syncActivity, doSyncInbox, doSyncOne };
}
