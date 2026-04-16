import { Box, Text } from "ink";
import { useMemo } from "react";
import { clockTime, colorFor, dayKey, dayLabel, truncate } from "../lib/format.ts";
import type { Attachment, Conversation, Message } from "../lib/types.ts";

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Produce a short, single-line description of an attachment for inline
 * rendering in the thread. Shape is intentionally compact because each
 * attachment is one terminal row.
 */
function formatAttachment(a: Attachment): string {
  switch (a.type) {
    case "image": {
      const dims = a.width && a.height ? ` ${a.width}×${a.height}` : "";
      return `🖼  image${dims}`;
    }
    case "gif":
      return "🖼  gif";
    case "video": {
      const dur = formatDuration(a.durationMs);
      const dims = a.width && a.height ? ` ${a.width}×${a.height}` : "";
      return `▶  video${dur ? ` ${dur}` : ""}${dims}`;
    }
    case "audio":
    case "voice": {
      const dur = formatDuration(a.durationMs);
      return `🎤 voice${dur ? ` ${dur}` : ""}`;
    }
    case "file": {
      const name = a.name || "file";
      const size = formatSize(a.size);
      return `📎 ${name}${size ? ` (${size})` : ""}`;
    }
    case "link_preview": {
      const title = a.title || a.url || "link";
      return `🔗 ${title}`;
    }
    case "post_share": {
      const author = a.authorName ? ` by ${a.authorName}` : "";
      const snippet = a.originalText ? `: ${truncate(a.originalText, 60)}` : "";
      return `↺ shared post${author}${snippet}`;
    }
    case "forwarded": {
      const author = a.authorName ? ` from ${a.authorName}` : "";
      const snippet = a.originalText ? `: ${truncate(a.originalText, 60)}` : "";
      return `⇢ forwarded${author}${snippet}`;
    }
    case "replied": {
      const author = a.authorName ? ` to ${a.authorName}` : "";
      const snippet = a.originalText ? `: ${truncate(a.originalText, 60)}` : "";
      return `↳ replying${author}${snippet}`;
    }
    case "unavailable":
      return "⊘ unavailable message";
    case "away_message":
      return "✈ away message";
    default: {
      // Graceful fallback for unknown/other — show URL or name if present.
      const hint = a.title || a.name || a.url;
      return hint ? `📎 ${truncate(String(hint), 60)}` : "📎 attachment";
    }
  }
}

type Props = {
  conversation: Conversation | null;
  messages: Message[];
  width: number;
  height: number;
  scrollOffset: number; // 0 = bottom (newest), positive = scrolled up
  /** URN of the message currently selected (for message-select mode). */
  selectedMessageUrn?: string | null;
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
  | {
      kind: "header";
      sender: string;
      time: string;
      mine: boolean;
      msgUrn: string;
      key: string;
    }
  | { kind: "body"; text: string; mine: boolean; msgUrn: string; key: string }
  | { kind: "attachment"; text: string; mine: boolean; msgUrn: string; key: string }
  | { kind: "reactions"; text: string; msgUrn: string; key: string }
  | { kind: "blank"; key: string };

export function Thread({
  conversation,
  messages,
  width,
  height,
  scrollOffset,
  selectedMessageUrn,
}: Props) {
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
        msgUrn: m.urn,
        key: `${m.urn}-h`,
      });
      const wrapped = wrap(m.body || "", innerWidth - 4);
      wrapped.forEach((w, idx) => {
        result.push({
          kind: "body",
          text: w,
          mine: m.isFromMe,
          msgUrn: m.urn,
          key: `${m.urn}-b-${idx}`,
        });
      });
      // Attachment one-liners. For attachment-only messages (empty body) this
      // is the visible content of the message; otherwise it's a footnote under
      // the commentary.
      if (m.attachments && m.attachments.length > 0) {
        m.attachments.forEach((a, idx) => {
          const text = formatAttachment(a);
          const wrappedA = wrap(text, innerWidth - 4);
          wrappedA.forEach((w, li) => {
            result.push({
              kind: "attachment",
              text: w,
              mine: m.isFromMe,
              msgUrn: m.urn,
              key: `${m.urn}-a-${idx}-${li}`,
            });
          });
        });
      }
      if (m.reactions && m.reactions.length > 0) {
        const r = m.reactions
          .map((rx) => `${rx.emoji}${rx.count > 1 ? `×${rx.count}` : ""}`)
          .join(" ");
        result.push({ kind: "reactions", text: r, msgUrn: m.urn, key: `${m.urn}-r` });
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
  let effectiveLastVisible = Math.max(0, totalLines - scrollOffset);
  let effectiveFirstVisible = Math.max(0, effectiveLastVisible - innerHeight);

  // When a message is selected (react mode), make sure its lines are on screen.
  // We find the header and the last line of that message (the tail blank) and,
  // if either is outside the current window, recenter the window around it.
  if (selectedMessageUrn) {
    const headerIdx = lines.findIndex(
      (l) =>
        (l.kind === "header" ||
          l.kind === "body" ||
          l.kind === "attachment" ||
          l.kind === "reactions") &&
        l.msgUrn === selectedMessageUrn
    );
    if (headerIdx !== -1) {
      // Find the last line belonging to this message (reactions row or last body row).
      let lastIdx = headerIdx;
      for (let i = headerIdx; i < lines.length; i++) {
        const ln = lines[i];
        if (!ln) break;
        if (
          (ln.kind === "header" ||
            ln.kind === "body" ||
            ln.kind === "attachment" ||
            ln.kind === "reactions") &&
          ln.msgUrn === selectedMessageUrn
        ) {
          lastIdx = i;
        } else if (ln.kind !== "blank" && ln.kind !== "day") {
          break;
        }
      }
      const withinWindow = headerIdx >= effectiveFirstVisible && lastIdx < effectiveLastVisible;
      if (!withinWindow) {
        // Keep the selected message roughly centered.
        const center = Math.floor(innerHeight / 2);
        effectiveLastVisible = Math.min(totalLines, Math.max(lastIdx + 1, headerIdx + center));
        effectiveFirstVisible = Math.max(0, effectiveLastVisible - innerHeight);
      }
    }
  }

  const slice = lines.slice(effectiveFirstVisible, effectiveLastVisible);
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
            const isSel = selectedMessageUrn === ln.msgUrn;
            return (
              <Box key={ln.key}>
                <Text color={isSel ? "yellowBright" : undefined} bold>
                  {isSel ? "› " : "  "}
                </Text>
                <Text bold color={isSel ? "yellowBright" : ln.mine ? "magentaBright" : accent}>
                  {ln.sender}
                </Text>
                <Text dimColor> {ln.time}</Text>
              </Box>
            );
          }
          if (ln.kind === "attachment") {
            return (
              <Box key={ln.key} paddingLeft={2}>
                <Text dimColor>{ln.text}</Text>
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
