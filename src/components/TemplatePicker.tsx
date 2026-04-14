import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { renderTemplate, type Template } from "../lib/templates.ts";
import type { Conversation } from "../lib/types.ts";

type Props = {
  templates: Template[];
  conv: Conversation | null;
  width: number;
  height: number;
  onCancel: () => void;
  /** Called with the rendered body when the user picks a template. */
  onPick: (renderedBody: string) => void;
  /** Called when the user asks to manage templates from here. */
  onManage: () => void;
};

export function TemplatePicker({
  templates,
  conv,
  width,
  height,
  onCancel,
  onPick,
  onManage,
}: Props) {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (input === "T") {
      onManage();
      return;
    }
    if (templates.length === 0) return;
    if (key.upArrow || input === "k") {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(templates.length - 1, c + 1));
      return;
    }
    if (key.return) {
      const picked = templates[cursor];
      if (picked) onPick(renderTemplate(picked.body, conv));
    }
  });

  const picked = templates[cursor] ?? null;
  const rendered = picked ? renderTemplate(picked.body, conv) : "";

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={2} paddingY={1}>
      <Box>
        <Text bold color="magentaBright">
          Templates
        </Text>
        <Text dimColor>
          {conv?.firstName || conv?.name ? ` · for ${conv.firstName ?? conv.name}` : ""}
          {" · "}
          {templates.length === 0
            ? "no templates yet — press T to manage"
            : "j/k navigate · ↵ insert · T manage · Esc cancel"}
        </Text>
      </Box>
      <Box height={1} />

      {templates.length === 0 ? (
        <Box flexDirection="column">
          <Text dimColor>Templates are quick replies with variable support. Examples:</Text>
          <Box height={1} />
          <Text dimColor>
            {"  "}Hey {"{firstName}"}! Thanks for reaching out.
          </Text>
          <Text dimColor>
            {"  "}Following up on my earlier note, {"{firstName}"}.
          </Text>
          <Box height={1} />
          <Text>
            Press <Text color="magentaBright">T</Text> to open the template manager.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="row" flexGrow={1}>
          {/* List */}
          <Box flexDirection="column" width={Math.floor(width * 0.4)}>
            {templates.map((t, i) => (
              <Box key={t.id}>
                <Text color={i === cursor ? "magentaBright" : undefined}>
                  {i === cursor ? "▸ " : "  "}
                </Text>
                <Text bold={i === cursor}>{t.name}</Text>
              </Box>
            ))}
          </Box>

          {/* Preview */}
          <Box
            flexDirection="column"
            flexGrow={1}
            paddingLeft={2}
            borderStyle="single"
            borderDimColor
            borderTop={false}
            borderRight={false}
            borderBottom={false}
          >
            <Text dimColor>preview (rendered for this conversation):</Text>
            <Box height={1} />
            {rendered ? (
              rendered.split("\n").map((line, i) => (
                // Preview is a static render of the selected template — the
                // list regenerates whenever `picked` changes, so index-based
                // keys are stable within any one render.
                // biome-ignore lint/suspicious/noArrayIndexKey: line order is fixed per template
                <Text key={`${picked?.id}-${i}`}>{line || " "}</Text>
              ))
            ) : (
              <Text dimColor>(empty)</Text>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
