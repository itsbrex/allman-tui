import { describe, expect, it } from "bun:test";
import {
  clockTime,
  colorFor,
  dayLabel,
  firstLine,
  relativeTime,
  truncate,
} from "../../src/lib/format.ts";

describe("relativeTime", () => {
  it("returns empty string for null/undefined", () => {
    expect(relativeTime(null)).toBe("");
    expect(relativeTime(undefined)).toBe("");
  });

  it("returns empty string for invalid date", () => {
    expect(relativeTime("not-a-date")).toBe("");
  });

  it("returns 'now' for future timestamps", () => {
    expect(relativeTime(new Date(Date.now() + 60_000).toISOString())).toBe("now");
  });

  it("returns 'now' for timestamps less than 3s ago", () => {
    expect(relativeTime(Date.now() - 1_000)).toBe("now");
  });

  it("returns seconds for sub-minute", () => {
    const result = relativeTime(Date.now() - 15_000);
    expect(result).toBe("15s");
  });

  it("returns minutes for sub-hour", () => {
    const result = relativeTime(Date.now() - 5 * 60_000);
    expect(result).toBe("5m");
  });

  it("returns hours for sub-day", () => {
    const result = relativeTime(Date.now() - 3 * 3600_000);
    expect(result).toBe("3h");
  });

  it("returns days for sub-week", () => {
    const result = relativeTime(Date.now() - 3 * 86400_000);
    expect(result).toBe("3d");
  });

  it("returns weeks for sub-month", () => {
    const result = relativeTime(Date.now() - 14 * 86400_000);
    expect(result).toBe("2w");
  });

  it("accepts numeric timestamps", () => {
    const result = relativeTime(Date.now() - 10_000);
    expect(result).toBe("10s");
  });
});

describe("clockTime", () => {
  it("formats AM time", () => {
    const d = new Date(2026, 0, 1, 9, 5);
    expect(clockTime(d.getTime())).toBe("9:05a");
  });

  it("formats PM time", () => {
    const d = new Date(2026, 0, 1, 14, 30);
    expect(clockTime(d.getTime())).toBe("2:30p");
  });

  it("formats midnight as 12:00a", () => {
    const d = new Date(2026, 0, 1, 0, 0);
    expect(clockTime(d.getTime())).toBe("12:00a");
  });

  it("formats noon as 12:00p", () => {
    const d = new Date(2026, 0, 1, 12, 0);
    expect(clockTime(d.getTime())).toBe("12:00p");
  });
});

describe("dayLabel", () => {
  it("returns 'Today' for today", () => {
    expect(dayLabel(Date.now())).toBe("Today");
  });

  it("returns 'Yesterday' for yesterday", () => {
    const yesterday = Date.now() - 86400_000;
    expect(dayLabel(yesterday)).toBe("Yesterday");
  });
});

describe("truncate", () => {
  it("returns string unchanged if within max", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates with ellipsis", () => {
    expect(truncate("hello world", 6)).toBe("hello…");
  });

  it("handles max=1", () => {
    expect(truncate("abc", 1)).toBe("…");
  });
});

describe("colorFor", () => {
  it("returns a consistent color for the same key", () => {
    expect(colorFor("alice")).toBe(colorFor("alice"));
  });

  it("returns different colors for different keys", () => {
    // Not guaranteed for all pairs, but these specific strings hash differently
    const colors = new Set([
      colorFor("alice"),
      colorFor("bob"),
      colorFor("charlie"),
      colorFor("dave"),
    ]);
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("firstLine", () => {
  it("returns the whole string if no newline", () => {
    expect(firstLine("hello")).toBe("hello");
  });

  it("returns text before the first newline", () => {
    expect(firstLine("hello\nworld")).toBe("hello");
  });
});
