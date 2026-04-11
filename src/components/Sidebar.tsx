import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { colorFor, firstLine, relativeTime, truncate } from "../lib/format.ts";
import type { Conversation, Message } from "../lib/types.ts";

type Props = {
  conversations: Conversation[];
  filtered: Conversation[];
  selectedConvId: string | null;
  cursorIdx: number;
  searchActive: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  width: number;
  height: number;
  lastMessages: Map<string, Message | null>;
};

export function Sidebar({
  filtered,
  selectedConvId,
  cursorIdx,
  searchActive,
  searchQuery,
  onSearchChange,
  width,
  height,
  lastMessages,
}: Props) {
  // Each conv card is 3 lines (name+time, preview, blank). Compute the visible
  // window so the cursor stays in view.
  const cardHeight = 3;
  const headerHeight = 2;
  const visibleCards = Math.max(1, Math.floor((height - headerHeight) / cardHeight));
  const start = Math.max(
    0,
    Math.min(cursorIdx - Math.floor(visibleCards / 2), filtered.length - visibleCards)
  );
  const safeStart = Math.max(0, start);
  const visible = filtered.slice(safeStart, safeStart + visibleCards);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box paddingX={1} height={1}>
        {searchActive ? (
          <>
            <Text color="magentaBright">/</Text>
            <Text> </Text>
            <TextInput
              value={searchQuery}
              onChange={onSearchChange}
              focus={searchActive}
              placeholder="search conversations…"
            />
          </>
        ) : (
          <Text dimColor>
            {filtered.length} {filtered.length === 1 ? "conversation" : "conversations"}
            {searchQuery ? `  ·  filter: ${searchQuery}` : "  ·  press / to search"}
          </Text>
        )}
      </Box>
      <Box height={1} paddingX={1}>
        <Text dimColor>{"─".repeat(Math.max(0, width - 2))}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {visible.length === 0 ? (
          <Box paddingX={2} paddingY={1}>
            <Text dimColor>
              {searchQuery ? "No matches." : "No conversations yet. Press n to start one."}
            </Text>
          </Box>
        ) : (
          visible.map((c, i) => {
            const idx = safeStart + i;
            const isSelected = c.convId === selectedConvId;
            const isCursor = idx === cursorIdx;
            const last = lastMessages.get(c.convId);
            const preview = last
              ? `${last.isFromMe ? "you: " : ""}${firstLine(last.body || "(no text)")}`
              : "(no messages)";
            const previewColor = c.unreadCount > 0 ? "white" : undefined;
            const accent = colorFor(c.slug || c.profileId || c.name);

            const nameMax = Math.max(8, width - 8);
            const previewMax = Math.max(8, width - 4);

            return (
              <Box key={c.convId} flexDirection="column" paddingX={1}>
                <Box>
                  <Text color={isCursor ? "magentaBright" : isSelected ? "magenta" : undefined}>
                    {isCursor ? "▸ " : "  "}
                  </Text>
                  <Text color={accent} bold={c.unreadCount > 0 || isCursor}>
                    {c.unreadCount > 0 ? "● " : "○ "}
                  </Text>
                  <Box flexGrow={1}>
                    <Text bold={isCursor || c.unreadCount > 0}>
                      {truncate(c.name || "Unknown", nameMax)}
                    </Text>
                  </Box>
                  <Text dimColor>{relativeTime(c.lastActivityAt)}</Text>
                </Box>
                <Box paddingLeft={4}>
                  <Text dimColor={c.unreadCount === 0} color={previewColor}>
                    {truncate(preview, previewMax)}
                  </Text>
                </Box>
                <Box height={1} />
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
