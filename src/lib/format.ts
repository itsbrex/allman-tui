// Compact, conversational formatting helpers for sidebar/thread.

export function relativeTime(iso: string | number | null | undefined): string {
  if (iso == null) return "";
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 0) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
}

export function clockTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")}${ampm}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = MONTHS[d.getMonth()];
  if (sameYear) return `${month} ${d.getDate()}`;
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

// Stable color hash so each contact gets a consistent accent.
const PALETTE = [
  "magentaBright",
  "cyanBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "redBright",
  "magenta",
  "cyan",
] as const;

export function colorFor(key: string): (typeof PALETTE)[number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length] as (typeof PALETTE)[number];
}

export function firstLine(body: string): string {
  const idx = body.indexOf("\n");
  return idx === -1 ? body : body.slice(0, idx);
}
