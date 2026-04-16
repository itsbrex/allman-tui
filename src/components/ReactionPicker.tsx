import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { LINKEDIN_DEFAULTS, searchEmoji } from "../lib/emoji-data.ts";
import type { Message } from "../lib/types.ts";

export const REACTION_PALETTE = LINKEDIN_DEFAULTS.map((e) => e.emoji);

type Props = {
  message: Message;
  width: number;
  /** Available rows for the picker. */
  height: number;
  onPick: (emoji: string, unreact: boolean) => void;
  onCancel: () => void;
};

export function ReactionPicker({ message, width, height, onPick, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const [cursorIdx, setCursorIdx] = useState(0);

  const mine = new Set(
    (message.reactions ?? []).filter((r) => r.hasUserReacted).map((r) => r.emoji)
  );

  const results = searchEmoji(query, 60);

  // Grid layout: fit as many emojis per row as width allows.
  // Each cell is 4 chars wide (emoji + space + padding).
  const cellWidth = 4;
  const usableWidth = Math.max(cellWidth, width - 4); // account for paddingX
  const cols = Math.max(1, Math.floor(usableWidth / cellWidth));
  // Reserve 2 rows: 1 for search input, 1 for defaults row
  const gridRows = Math.max(1, height - 2);
  const visibleCount = cols * gridRows;

  // Clamp cursor
  const maxIdx = Math.max(0, results.length - 1);
  const clampedCursor = Math.min(cursorIdx, maxIdx);

  // Determine scroll window so the cursor row is visible
  const cursorRow = Math.floor(clampedCursor / cols);
  const scrollRowOffset = Math.max(0, cursorRow - gridRows + 1);
  const startIdx = scrollRowOffset * cols;
  const visible = results.slice(startIdx, startIdx + visibleCount);

  useInput((input, key) => {
    if (key.escape) {
      if (query) {
        setQuery("");
        setCursorIdx(0);
      } else {
        onCancel();
      }
      return;
    }
    if (key.return) {
      const entry = results[clampedCursor];
      if (entry) onPick(entry.emoji, mine.has(entry.emoji));
      return;
    }

    // Quick-pick: 1-6 for LinkedIn defaults (only when not searching)
    if (!query) {
      const num = Number.parseInt(input, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= 6) {
        const def = LINKEDIN_DEFAULTS[num - 1];
        if (def) onPick(def.emoji, mine.has(def.emoji));
        return;
      }
    }

    // Arrow navigation
    if (key.rightArrow || (key.tab && !key.shift)) {
      setCursorIdx((c) => Math.min(maxIdx, c + 1));
      return;
    }
    if (key.leftArrow || (key.shift && key.tab)) {
      setCursorIdx((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursorIdx((c) => Math.min(maxIdx, c + cols));
      return;
    }
    if (key.upArrow) {
      setCursorIdx((c) => Math.max(0, c - cols));
      return;
    }

    // Backspace
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setCursorIdx(0);
      return;
    }

    // Typing: only printable single chars
    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setQuery((q) => q + input);
      setCursorIdx(0);
    }
  });

  // Build grid rows from visible results
  const gridRowsData: (typeof visible)[] = [];
  for (let i = 0; i < visible.length; i += cols) {
    gridRowsData.push(visible.slice(i, i + cols));
  }

  const preview = (message.body || "(no text)").replace(/\n/g, " ");
  const maxPreview = Math.max(10, width - 30);

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1}>
      {/* Defaults row + search */}
      <Box>
        <Text dimColor>react to </Text>
        <Text>{preview.length > maxPreview ? `${preview.slice(0, maxPreview)}…` : preview}</Text>
      </Box>
      <Box>
        {LINKEDIN_DEFAULTS.map((e, i) => (
          <Box key={e.emoji} width={6}>
            <Text color={mine.has(e.emoji) ? "yellow" : "magentaBright"}>{i + 1}</Text>
            <Text>
              {mine.has(e.emoji) ? "̶" : " "}
              {e.emoji}
            </Text>
          </Box>
        ))}
        <Text dimColor> │ </Text>
        <Text color="cyanBright">/</Text>
        <Text>{query || ""}</Text>
        <Text dimColor>{query ? "" : "type to search…"}</Text>
      </Box>
      {/* Emoji grid */}
      {gridRowsData.map((row, ri) => {
        const rowKey = row[0]?.emoji ?? `empty-${ri}`;
        return (
          <Box key={rowKey}>
            {row.map((entry, ci) => {
              const globalIdx = startIdx + ri * cols + ci;
              const isSel = globalIdx === clampedCursor;
              const isReacted = mine.has(entry.emoji);
              return (
                <Box key={entry.emoji} width={cellWidth}>
                  <Text
                    backgroundColor={isSel ? "magenta" : undefined}
                    color={isReacted ? "yellow" : undefined}
                  >
                    {entry.emoji}
                  </Text>
                  <Text>{isSel ? "" : " "}</Text>
                </Box>
              );
            })}
            {/* Show keyword hint for the cursor emoji on its row */}
            {ri === cursorRow - scrollRowOffset && results[clampedCursor] ? (
              <Box marginLeft={1}>
                <Text dimColor>{results[clampedCursor].keywords[0]}</Text>
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
