/**
 * TUI network layer: reading enriched connection records off disk and building
 * the arguments handed to the `allman` binary.
 *
 * The binary owns every guard that matters (rate limits, volume quotas,
 * duplicate detection, the 300-char note cap), so what's worth testing here is
 * that the TUI passes intent through faithfully and reads the store correctly.
 *
 * Real temp directories, no network. All ids/slugs are synthetic.
 */
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { formatConnectionSummary, loadConnection } from "../../src/lib/allman.ts";

const ID = "ACoSYNTH0000000000000000000000000000001";

let accountDir: string;

beforeEach(() => {
  accountDir = mkdtempSync(join(tmpdir(), "allman-tui-conn-"));
  mkdirSync(join(accountDir, "connections"), { recursive: true });
});
afterEach(() => rmSync(accountDir, { recursive: true, force: true }));

function writeConnection(rec: Record<string, unknown>, slug?: string) {
  const file = `${rec.flagshipId as string}.json`;
  writeFileSync(join(accountDir, "connections", file), JSON.stringify(rec, null, 2));
  if (slug) symlinkSync(file, join(accountDir, "connections", slug));
}

describe("loadConnection", () => {
  test("reads a record by flagship id", () => {
    writeConnection({ flagshipId: ID, publicIdentifier: "syn-user", title: "Engineer" });
    expect(loadConnection(accountDir, ID)?.title).toBe("Engineer");
  });

  test("reads the same record through its slug symlink", () => {
    writeConnection({ flagshipId: ID, publicIdentifier: "syn-user", title: "Engineer" }, "syn-user");
    expect(loadConnection(accountDir, "syn-user")?.flagshipId).toBe(ID);
  });

  test("returns null for someone not in the store", () => {
    expect(loadConnection(accountDir, "nobody")).toBeNull();
  });

  test("returns null rather than throwing on a corrupt record", () => {
    writeFileSync(join(accountDir, "connections", "bad.json"), "{not json");
    expect(loadConnection(accountDir, "bad")).toBeNull();
  });

  test("returns null when the store has no connections directory at all", () => {
    const empty = mkdtempSync(join(tmpdir(), "allman-tui-empty-"));
    expect(loadConnection(empty, ID)).toBeNull();
    rmSync(empty, { recursive: true, force: true });
  });
});

describe("formatConnectionSummary", () => {
  test("combines role and location", () => {
    expect(
      formatConnectionSummary({
        flagshipId: ID,
        publicIdentifier: null,
        title: "Staff Engineer",
        company: "Test Co",
        location: "Testville",
      })
    ).toBe("Staff Engineer at Test Co — Testville");
  });

  test("falls back to the headline when the record is unenriched", () => {
    expect(
      formatConnectionSummary({
        flagshipId: ID,
        publicIdentifier: null,
        headline: "Builder of things",
      })
    ).toBe("Builder of things");
  });

  test("prefers enriched role over the headline", () => {
    expect(
      formatConnectionSummary({
        flagshipId: ID,
        publicIdentifier: null,
        headline: "Stale headline",
        title: "CTO",
        company: "Test Co",
      })
    ).toBe("CTO at Test Co");
  });

  test("handles a company with no title", () => {
    expect(
      formatConnectionSummary({ flagshipId: ID, publicIdentifier: null, company: "Test Co" })
    ).toBe("Test Co");
  });

  test("returns null when there is nothing to show", () => {
    expect(formatConnectionSummary({ flagshipId: ID, publicIdentifier: null })).toBeNull();
    expect(formatConnectionSummary(null)).toBeNull();
  });
});
