import { Box, Text } from "ink";
import { useMemo } from "react";
import { clockTime, colorFor, dayKey, dayLabel, truncate } from "../lib/format.ts";
import type { Conversation, Message } from "../lib/types.ts";

type Props = {
  conversation: Conversation | null;
  messages: Message[];
  width: number;
  height: number;
  scrollOffset: number; // 0 = bottom (newest), positive = scrolled up
};

// Word-wrap a string into lines that fit within `width` columns. Preserves
// explicit newlines and avoids splitting mid-word when possible.
function wrap(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(" ")) {
      if (!line) {
        line = word.length > width ? word.slice(0, width) : word;
        if (word.length > width) {
          out.push(line);
          line = word.slice(width);
          while (line.length > width) {
            out.push(line.slice(0, width));
            line = line.slice(width);
          }
        }
        continue;
      }
      if (line.length + 1 + word.length <= width) {
        line += ` ${word}`;
      } else {
        out.push(line);
        line = word;
        while (line.length > width) {
          out.push(line.slice(0, width));
          line = line.slice(width);
        }
      }
    }
    if (line) out.push(line);
  }
  return out;
}

type FlatLine =
  | { kind: "day"; label: string; key: string }
  | { kind: "header"; sender: string; time: string; mine: boolean; key: string }
  | { kind: "body"; text: string; mine: boolean; key: string }
  | { kind: "reactions"; text: string; key: string }
  | { kind: "blank"; key: string };

export function Thread({ conversation, messages, width, height, scrollOffset }: Props) {
  const headerHeight = 3;
  const innerHeight = Math.max(1, height - headerHeight);
  const innerWidth = Math.max(10, width - 4);

  const lines = useMemo<FlatLine[]>(() => {
    if (!conversation) return [];
    const result: FlatLine[] = [];
    let lastDay: string | null = null;
    for (const m of messages) {
      const dk = dayKey(m.timestamp);
      if (dk !== lastDay) {
        if (result.length) result.push({ kind: "blank", key: `blank-pre-${m.urn}` });
        result.push({ kind: "day", label: dayLabel(m.timestamp), key: `day-${dk}-${m.urn}` });
        result.push({ kind: "blank", key: `blank-post-${m.urn}` });
        lastDay = dk;
      }
      // Prefer first name only — feels more like a chat than a roster.
      const fullName = m.fromName || conversation.name || "them";
      const sender = m.isFromMe
        ? "you"
        : (conversation.firstName || fullName.split(" ")[0] || fullName).trim();
      result.push({
        kind: "header",
        sender,
        time: clockTime(m.timestamp),
        mine: m.isFromMe,
        key: `${m.urn}-h`,
      });
      const wrapped = wrap(m.body || "", innerWidth - 4);
      wrapped.forEach((w, idx) => {
        result.push({ kind: "body", text: w, mine: m.isFromMe, key: `${m.urn}-b-${idx}` });
      });
      if (m.reactions && m.reactions.length > 0) {
        const r = m.reactions
          .map((rx) => `${rx.emoji}${rx.count > 1 ? `×${rx.count}` : ""}`)
          .join(" ");
        result.push({ kind: "reactions", text: r, key: `${m.urn}-r` });
      }
      result.push({ kind: "blank", key: `${m.urn}-tail` });
    }
    return result;
  }, [conversation, messages, innerWidth]);

  if (!conversation) {
    return (
      <Box flexDirection="column" width={width} height={height} paddingX={2} paddingY={2}>
        <Text dimColor>No conversation selected.</Text>
        <Text dimColor>↑/↓ or j/k to navigate · Enter to open · n for new conversation</Text>
      </Box>
    );
  }

  // Compute which slice of `lines` is visible. Default: anchor to bottom.
  const totalLines = lines.length;
  const lastVisible = Math.max(0, totalLines - scrollOffset);
  const firstVisible = Math.max(0, lastVisible - innerHeight);
  const slice = lines.slice(firstVisible, lastVisible);
  // Pad top so content sits at bottom even when shorter than the pane.
  const pad = Math.max(0, innerHeight - slice.length);

  const accent = colorFor(conversation.slug || conversation.profileId || conversation.name);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box paddingX={2} paddingTop={1} flexDirection="column" height={headerHeight}>
        <Box>
          <Text bold color={accent}>
            {conversation.name}
          </Text>
          {conversation.slug ? <Text dimColor> @{conversation.slug}</Text> : null}
          {conversation.unreadCount > 0 ? (
            <Text color="magentaBright" bold>
              {"  "}● {conversation.unreadCount} new
            </Text>
          ) : null}
        </Box>
        <Box>
          <Text dimColor>{truncate(conversation.headline || "", Math.max(0, width - 4))}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" paddingX={2} flexGrow={1}>
        {pad > 0 ? <Box height={pad} /> : null}
        {slice.map((ln) => {
          if (ln.kind === "blank") return <Box key={ln.key} height={1} />;
          if (ln.kind === "day") {
            const dashCount = Math.max(2, Math.floor((innerWidth - ln.label.length - 2) / 2));
            const dashes = "─".repeat(dashCount);
            return (
              <Box key={ln.key}>
                <Text dimColor>
                  {dashes} {ln.label} {dashes}
                </Text>
              </Box>
            );
          }
          if (ln.kind === "header") {
            return (
              <Box key={ln.key}>
                <Text bold color={ln.mine ? "magentaBright" : accent}>
                  {ln.sender}
                </Text>
                <Text dimColor> {ln.time}</Text>
              </Box>
            );
          }
          if (ln.kind === "reactions") {
            return (
              <Box key={ln.key} paddingLeft={2}>
                <Text dimColor>↳ {ln.text}</Text>
              </Box>
            );
          }
          return (
            <Box key={ln.key} paddingLeft={2}>
              <Text>{ln.text}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
