import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import { searchProfiles } from "../lib/allman.ts";
import type { SearchResult } from "../lib/types.ts";

type Props = {
  width: number;
  height: number;
  onCancel: () => void;
  onPick: (result: SearchResult) => void;
};

export function NewConversation({ width, height, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Debounced search.
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      searchProfiles(query, { limit: 12 })
        .then((r) => {
          setResults(r);
          setCursor(0);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // The parent App routes navigation keys here via a callback through props,
  // but we keep cursor state local. Expose simple Enter behavior via TextInput.

  const handleSubmit = () => {
    const pick = results[cursor];
    if (pick) onPick(pick);
  };

  // Receive arrow keys via the parent's useInput; we expose this via window-style
  // mutation by exporting a small hook would over-complicate. Instead, the parent
  // forwards intent via the cursor by re-rendering with imperative approach.
  // Simpler: expose key handlers here too.
  useArrowKeys((d) => {
    if (results.length === 0) return;
    if (d === "up") setCursor((c) => Math.max(0, c - 1));
    if (d === "down") setCursor((c) => Math.min(results.length - 1, c + 1));
  });

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={2} paddingY={1}>
      <Box>
        <Text bold color="magentaBright">
          New conversation
        </Text>
        <Text dimColor> · search a contact by name or slug · Esc to cancel</Text>
      </Box>
      <Box height={1} />
      <Box>
        <Text color="magentaBright">▶ </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          focus
          placeholder="type a name or slug…"
        />
      </Box>
      <Box height={1} />
      {error ? (
        <Text color="redBright">error: {error}</Text>
      ) : loading ? (
        <Text dimColor>searching…</Text>
      ) : results.length === 0 ? (
        <Text dimColor>{query ? "no matches" : "type at least one character"}</Text>
      ) : (
        <Box flexDirection="column">
          {results.map((r, i) => (
            <Box key={r.profileId}>
              <Text color={i === cursor ? "magentaBright" : undefined}>
                {i === cursor ? "▸ " : "  "}
              </Text>
              <Text bold={i === cursor}>{r.name}</Text>
              {r.slug ? <Text dimColor> @{r.slug}</Text> : null}
              <Box flexGrow={1} />
              <Text dimColor>
                {r.convId ? "existing thread" : "new"} · {r.confidence}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// Tiny hook so the modal handles its own arrow keys without prop drilling.
function useArrowKeys(onMove: (dir: "up" | "down") => void) {
  useInput((_input, key) => {
    if (key.upArrow) onMove("up");
    if (key.downArrow) onMove("down");
  });
}
