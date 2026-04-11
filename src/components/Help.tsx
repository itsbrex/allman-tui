import { Box, Text } from "ink";

type Props = { width: number; height: number };

const ROWS: [string, string][] = [
  ["j / ↓", "next conversation"],
  ["k / ↑", "previous conversation"],
  ["g", "jump to top"],
  ["G", "jump to bottom"],
  ["↵", "open conversation"],
  ["i", "compose a reply"],
  ["Esc", "leave any mode"],
  ["/", "search conversation list"],
  ["n", "start a new conversation"],
  [":", "command palette  ( :sync, :sync <slug>, :reload, :quit )"],
  ["r", "sync (pull from LinkedIn)"],
  ["R", "reload from store"],
  ["PgUp / PgDn", "scroll thread"],
  ["?", "toggle this help"],
  ["q  /  Ctrl+C", "quit"],
];

export function Help({ width, height }: Props) {
  return (
    <Box flexDirection="column" width={width} height={height} paddingX={3} paddingY={2}>
      <Box>
        <Text bold color="magentaBright">
          lilac-tui
        </Text>
        <Text dimColor> · keyboard reference · Esc to close</Text>
      </Box>
      <Box height={1} />
      {ROWS.map(([k, v]) => (
        <Box key={k}>
          <Box width={16}>
            <Text color="magentaBright">{k}</Text>
          </Box>
          <Text>{v}</Text>
        </Box>
      ))}
      <Box height={1} />
      <Text dimColor>store: $LILAC_STORE · account: $LILAC_ACCOUNT · bin: $LILAC_BIN</Text>
      <Text dimColor>
        Reads come straight from the file store; sends, sync, search, and live updates use the
        bundled lilac binary.
      </Text>
    </Box>
  );
}
