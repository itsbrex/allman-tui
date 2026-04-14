import { Box, Text } from "ink";
import type { Mode } from "../app.tsx";
import { relativeTime } from "../lib/format.ts";

/**
 * Live sync activity reported through the streaming `lilac sync --json` channel.
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

const HINTS: Record<Mode, string> = {
  browse:
    "j/k navigate · ↵ open · i compose · t template · T templates · / search · n new · r sync · : cmd · ? help · q quit",
  compose: "↵ send · Esc cancel",
  search: "type to filter · ↵ select first · Esc clear",
  new: "type a name · ↵ select · Esc cancel",
  command: "type a command · ↵ run · Esc cancel",
  help: "Esc to close",
  templatePick: "j/k navigate · ↵ insert into composer · T manage · Esc cancel",
  templateManage: "j/k navigate · n new · e edit · d delete · Esc close",
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

  return (
    <Box flexDirection="column" width={width}>
      <Box width={width} paddingX={1}>
        <Text color="magentaBright" bold>
          lilac
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
              {syncActivity.scope === "inbox"
                ? "syncing inbox"
                : `backfilling ${syncActivity.label}`}
            </Text>
            {syncActivity.scope === "inbox" && syncActivity.conversationsSeen !== undefined ? (
              <Text
                dimColor
              >{` ${syncActivity.conversationsSeen}c/${syncActivity.messagesFetched}m`}</Text>
            ) : (
              <Text dimColor>{` ${syncActivity.messagesFetched}m`}</Text>
            )}
          </>
        ) : lastSyncAt ? (
          <>
            <Text dimColor> · </Text>
            <Text dimColor>synced {relativeTime(lastSyncAt) || "now"} ago</Text>
          </>
        ) : null}
        {toast ? (
          <>
            <Text dimColor> · </Text>
            <Text color="cyanBright">{toast}</Text>
          </>
        ) : null}
        <Box flexGrow={1} />
        <Text dimColor>[{mode}]</Text>
      </Box>
      <Box width={width} paddingX={1}>
        <Text dimColor>{HINTS[mode]}</Text>
      </Box>
    </Box>
  );
}
