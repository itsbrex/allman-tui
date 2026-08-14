import { describe, expect, it } from "bun:test";
import { LINKEDIN_DEFAULTS, searchEmoji, UNIQUE_EMOJI } from "../../src/lib/emoji-data.ts";

describe("emoji-data", () => {
  it("has 6 LinkedIn defaults", () => {
    expect(LINKEDIN_DEFAULTS).toHaveLength(6);
    expect(LINKEDIN_DEFAULTS.map((e) => e.emoji)).toEqual(["👍", "❤️", "😂", "😮", "😢", "👏"]);
  });

  it("has no duplicate emojis in UNIQUE_EMOJI", () => {
    const emojis = UNIQUE_EMOJI.map((e) => e.emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
  });

  it("every entry has at least one keyword", () => {
    for (const entry of UNIQUE_EMOJI) {
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });

  describe("searchEmoji", () => {
    it("returns all emojis when query is empty", () => {
      const results = searchEmoji("");
      expect(results.length).toBeGreaterThan(10);
    });

    it("prefix match: 'fire' finds 🔥", () => {
      const results = searchEmoji("fire");
      expect(results.some((e) => e.emoji === "🔥")).toBe(true);
    });

    it("prefix match: 'rock' finds 🚀 (rocket) and 🤘 (rock-on)", () => {
      const results = searchEmoji("rock");
      expect(results.some((e) => e.emoji === "🚀")).toBe(true);
      expect(results.some((e) => e.emoji === "🤘")).toBe(true);
    });

    it("substring match: 'ugh' matches 'laugh'", () => {
      const results = searchEmoji("ugh");
      expect(results.some((e) => e.emoji === "😂")).toBe(true);
    });

    it("returns empty for gibberish query", () => {
      const results = searchEmoji("xyzqwerty");
      expect(results).toHaveLength(0);
    });

    it("respects limit parameter", () => {
      const results = searchEmoji("", 5);
      expect(results).toHaveLength(5);
    });

    it("is case-insensitive", () => {
      const lower = searchEmoji("heart");
      const upper = searchEmoji("HEART");
      expect(lower.length).toBe(upper.length);
    });
  });
});
