import { Box, Text } from "ink";
import type { Mode } from "../app.tsx";
import { relativeTime } from "../lib/format.ts";

// The full keybinding reference lives in the `?` help overlay. We keep the
// status bar to a single line so the body gets as much real estate as
// possible. In modes where the control surface is unusual (compose, search,
// command) we still surface the essentials inline next to the mode tag.
const MODE_HINT: Partial<Record<Mode, string>> = {
  compose: "↵ send · Esc cancel",
  search: "↵ select first · Esc clear",
  command: "↵ run · Esc cancel",
  new: "↵ select · Esc cancel",
  templatePick: "↵ insert · Esc cancel",
  templateManage: "n new · e edit · d delete · Esc close",
  messageSelect: "j/k pick · ↵ emoji · Esc cancel",
  reactionPick: "1-6 quick · type search · ↵ pick · Esc back",
};

/**
 * Live sync activity reported through the streaming `allman sync --json` channel.
 * `null` means nothing is syncing right now.
 */
export type SyncActivity = {
  /** "inbox" walks all conversations; "conversation" backfills one. */
  scope: "inbox" | "conversation";
  /** Display label — slug, name, or "inbox". */
  label: string;
  /** Total messages fetched so far (across the current run). */
  messagesFetched: number;
  /** Conversations seen so far — only meaningful for inbox scope. */
  conversationsSeen?: number;
};

type Props = {
  mode: Mode;
  accountSlug: string;
  totalConvs: number;
  unreadConvs: number;
  listenStatus: "starting" | "connected" | "disconnected" | "error" | "off";
  /** Last time we saw any signal from the listen subprocess (heartbeat or event). */
  lastBeatAt: number | null;
  /** ISO timestamp of the most recent successful sync (from AUTH.json). */
  lastSyncAt: string | null;
  /** Currently-running sync, or null if idle. */
  syncActivity: SyncActivity | null;
  toast: string | null;
  width: number;
};

export function StatusBar({
  mode,
  accountSlug,
  totalConvs,
  unreadConvs,
  listenStatus,
  lastBeatAt,
  lastSyncAt,
  syncActivity,
  toast,
  width,
}: Props) {
  // Treat the listen channel as "live" if it's connected AND we've seen a
  // heartbeat in the last 90s. LinkedIn pings roughly every 30s.
  const beatFresh = lastBeatAt ? Date.now() - lastBeatAt < 90_000 : false;
  const live = listenStatus === "connected" && beatFresh;

  const dot = live
    ? { color: "greenBright" as const, glyph: "●" }
    : listenStatus === "connected"
      ? { color: "green" as const, glyph: "◉" }
      : listenStatus === "starting"
        ? { color: "yellowBright" as const, glyph: "◐" }
        : listenStatus === "error"
          ? { color: "redBright" as const, glyph: "✕" }
          : listenStatus === "disconnected"
            ? { color: "yellow" as const, glyph: "○" }
            : { color: "gray" as const, glyph: "·" };

  const liveLabel = live ? "live" : listenStatus === "connected" ? "stale" : listenStatus;

  const hint = MODE_HINT[mode];

  return (
    <Box width={width} paddingX={1}>
      <Text color="magentaBright" bold>
        allman
      </Text>
      <Text dimColor> · </Text>
      <Text>{accountSlug}</Text>
      <Text dimColor> · </Text>
      <Text color={dot.color}>{dot.glyph}</Text>
      <Text dimColor> {liveLabel}</Text>
      <Text dimColor> · </Text>
      <Text>{totalConvs}</Text>
      <Text dimColor> convs</Text>
      {unreadConvs > 0 ? (
        <>
          <Text dimColor> · </Text>
          <Text color="magentaBright" bold>
            {unreadConvs} unread
          </Text>
        </>
      ) : null}
      {syncActivity ? (
        <>
          <Text dimColor> · </Text>
          <Text color="yellowBright">⟳ </Text>
          <Text color="yellowBright">
            {syncActivity.scope === "inbox" ? "syncing inbox" : `backfilling ${syncActivity.label}`}
          </Text>
          {syncActivity.scope === "inbox" && syncActivity.conversationsSeen !== undefined ? (
            <Text
              dimColor
            >{` ${syncActivity.conversationsSeen}c/${syncActivity.messagesFetched}m`}</Text>
          ) : (
            <Text dimColor>{` ${syncActivity.messagesFetched}m`}</Text>
          )}
        </>
      ) : lastSyncAt && !live ? (
        // Only show the "synced X ago" label when we're NOT live on SSE. When
        // the listen channel is flowing, real-time updates make the last-sync
        // time uninteresting (and misleading — we're current, not stale).
        <>
          <Text dimColor> · </Text>
          <Text dimColor>
            {(() => {
              const rel = relativeTime(lastSyncAt);
              return rel === "now" ? "synced just now" : `synced ${rel} ago`;
            })()}
          </Text>
        </>
      ) : null}
      {toast ? (
        <>
          <Text dimColor> · </Text>
          <Text color="cyanBright">{toast}</Text>
        </>
      ) : null}
      <Box flexGrow={1} />
      {hint ? (
        <>
          <Text dimColor>{hint}</Text>
          <Text dimColor> · </Text>
        </>
      ) : (
        <>
          <Text dimColor>? help</Text>
          <Text dimColor> · </Text>
        </>
      )}
      <Text dimColor>[{mode}]</Text>
    </Box>
  );
}
