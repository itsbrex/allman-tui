import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type Props = {
  recipientName: string | null;
  text: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  active: boolean;
  sending: boolean;
  width: number;
};

export function Composer({
  recipientName,
  text,
  onChange,
  onSubmit,
  active,
  sending,
  width,
}: Props) {
  return (
    <Box width={width} paddingX={1}>
      <Text color={active ? "magentaBright" : undefined}>▶ </Text>
      {sending ? (
        <Text color="yellowBright">sending…</Text>
      ) : active ? (
        <Box flexGrow={1}>
          <TextInput
            value={text}
            onChange={onChange}
            onSubmit={onSubmit}
            focus={active}
            placeholder={
              recipientName ? `Reply to ${recipientName}…   (Enter to send · Esc to cancel)` : "…"
            }
          />
        </Box>
      ) : (
        <Text dimColor>
          {recipientName
            ? `Reply to ${recipientName}…   (press i to compose)`
            : "Select a conversation to reply"}
        </Text>
      )}
    </Box>
  );
}
