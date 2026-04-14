// Quick-reply templates. TUI-local config (not in the lilac store) because
// templates are TUI UX data, not LinkedIn state — no rate limiting or git
// commits needed. Stored as JSON at $XDG_CONFIG_HOME/lilac-tui/templates.json
// (or ~/.config/lilac-tui/templates.json on platforms without XDG).
//
// Bodies may contain {variable} placeholders which are substituted against
// the target conversation at render time. Unknown variables are left as-is.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { Conversation } from "./types.ts";

export type Template = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
};

function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "lilac-tui", "templates.json");
}

export function loadTemplates(): Template[] {
  const path = configPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTemplate);
  } catch {
    // Malformed file — treat as empty so we don't wipe user data by overwriting.
    return [];
  }
}

export function saveTemplates(list: Template[]): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  // Atomic write: tmp file → rename. Avoids half-written JSON on crash.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`);
  renameSync(tmp, path);
}

/**
 * Substitute {firstName}, {lastName}, {name}, {slug} against the target
 * conversation. Unknown placeholders are left untouched so the user sees
 * the original text and can fix the template. Case-sensitive on purpose —
 * a pattern like {Name} is ambiguous and better surfaced as a mistake.
 */
export function renderTemplate(body: string, conv: Conversation | null): string {
  if (!conv) return body;
  const vars: Record<string, string> = {
    firstName: conv.firstName ?? "",
    lastName: conv.lastName ?? "",
    name: conv.name ?? "",
    slug: conv.slug ?? "",
  };
  return body.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? (vars[key] ?? "") : match
  );
}

export function newTemplate(name: string, body: string): Template {
  return {
    id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "untitled",
    body,
    createdAt: new Date().toISOString(),
  };
}

function isTemplate(v: unknown): v is Template {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.body === "string" &&
    typeof o.createdAt === "string"
  );
}
