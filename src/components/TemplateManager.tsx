import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
import { newTemplate, type Template } from "../lib/templates.ts";

type Props = {
  templates: Template[];
  width: number;
  height: number;
  onClose: () => void;
  onChange: (next: Template[]) => void;
};

type EditStep = "name" | "body";
type EditState =
  | { mode: "list" }
  | { mode: "edit"; id: string | null; step: EditStep; name: string; body: string };

export function TemplateManager({ templates, width, height, onClose, onChange }: Props) {
  const [cursor, setCursor] = useState(0);
  const [state, setState] = useState<EditState>({ mode: "list" });
  const [flash, setFlash] = useState<string | null>(null);

  useInput((input, key) => {
    // Edit mode — TextInput owns most keys; we only handle Esc.
    if (state.mode === "edit") {
      if (key.escape) {
        setState({ mode: "list" });
      }
      return;
    }

    // List mode.
    if (key.escape) {
      onClose();
      return;
    }
    if (input === "n") {
      setState({ mode: "edit", id: null, step: "name", name: "", body: "" });
      return;
    }
    if (input === "e") {
      const t = templates[cursor];
      if (t) {
        setState({ mode: "edit", id: t.id, step: "name", name: t.name, body: t.body });
      }
      return;
    }
    if (input === "d") {
      const t = templates[cursor];
      if (!t) return;
      const next = templates.filter((x) => x.id !== t.id);
      onChange(next);
      setCursor((c) => Math.max(0, Math.min(c, next.length - 1)));
      setFlash(`deleted "${t.name}"`);
      setTimeout(() => setFlash(null), 1500);
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
  });

  // --- Edit flow handlers ---
  const commitName = (name: string) => {
    if (state.mode !== "edit") return;
    setState({ ...state, name, step: "body" });
  };
  const commitBody = (body: string) => {
    if (state.mode !== "edit") return;
    const trimmedName = state.name.trim();
    if (!trimmedName) {
      setFlash("name is required");
      setTimeout(() => setFlash(null), 1500);
      return;
    }
    let next: Template[];
    if (state.id) {
      next = templates.map((t) => (t.id === state.id ? { ...t, name: trimmedName, body } : t));
      setFlash(`updated "${trimmedName}"`);
    } else {
      const t = newTemplate(trimmedName, body);
      next = [...templates, t];
      setCursor(next.length - 1);
      setFlash(`saved "${trimmedName}"`);
    }
    onChange(next);
    setState({ mode: "list" });
    setTimeout(() => setFlash(null), 1500);
  };

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={2} paddingY={1}>
      <Box>
        <Text bold color="magentaBright">
          Templates
        </Text>
        <Text dimColor>
          {state.mode === "list"
            ? ` · ${templates.length} saved · n new · e edit · d delete · Esc close`
            : state.step === "name"
              ? ` · ${state.id ? "edit" : "new"} · name · ↵ next · Esc cancel`
              : ` · ${state.id ? "edit" : "new"} · body · ↵ save · Esc cancel · variables: {firstName} {lastName} {name} {slug}`}
        </Text>
      </Box>
      <Box height={1} />

      {state.mode === "edit" ? (
        <Box flexDirection="column">
          <Box>
            <Box width={8}>
              <Text dimColor>name</Text>
            </Box>
            {state.step === "name" ? (
              <Box flexGrow={1}>
                <TextInput
                  value={state.name}
                  onChange={(v) => setState({ ...state, name: v })}
                  onSubmit={commitName}
                  focus
                  placeholder="short label e.g. Follow up"
                />
              </Box>
            ) : (
              <Text>{state.name}</Text>
            )}
          </Box>
          <Box height={1} />
          <Box>
            <Box width={8}>
              <Text dimColor>body</Text>
            </Box>
            {state.step === "body" ? (
              <Box flexGrow={1}>
                <TextInput
                  value={state.body}
                  onChange={(v) => setState({ ...state, body: v })}
                  onSubmit={commitBody}
                  focus
                  placeholder="Hey {firstName}! …"
                />
              </Box>
            ) : (
              <Text dimColor>{state.body || "(empty)"}</Text>
            )}
          </Box>
        </Box>
      ) : templates.length === 0 ? (
        <Box flexDirection="column">
          <Text dimColor>No templates yet.</Text>
          <Box height={1} />
          <Text>
            Press <Text color="magentaBright">n</Text> to create one. Bodies can include{" "}
            <Text color="cyanBright">{"{firstName}"}</Text>,{" "}
            <Text color="cyanBright">{"{lastName}"}</Text>,{" "}
            <Text color="cyanBright">{"{name}"}</Text>, or{" "}
            <Text color="cyanBright">{"{slug}"}</Text> — substituted for the recipient when you use
            the template.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {templates.map((t, i) => (
            <Box key={t.id} flexDirection="column" paddingY={0}>
              <Box>
                <Text color={i === cursor ? "magentaBright" : undefined}>
                  {i === cursor ? "▸ " : "  "}
                </Text>
                <Text bold={i === cursor}>{t.name}</Text>
              </Box>
              <Box paddingLeft={4}>
                <Text dimColor>{truncate(t.body, Math.max(20, width - 10))}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {flash ? (
        <>
          <Box height={1} />
          <Text color="cyanBright">{flash}</Text>
        </>
      ) : null}
    </Box>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}
