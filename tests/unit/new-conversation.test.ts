/**
 * Resolution of a new-conversation search pick: existing thread in memory, on
 * disk, via the slug symlink, or a placeholder draft. Real temp directories,
 * no network. All ids/slugs are synthetic.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { resolveNewConversationPick } from "../../src/lib/new-conversation.ts";
import type { Conversation, SearchResult } from "../../src/lib/types.ts";

const CONV_ID = "2-SYNTHCONV0000000000000001";

let accountDir: string;

beforeEach(() => {
  accountDir = mkdtempSync(join(tmpdir(), "allman-tui-pick-"));
});
afterEach(() => rmSync(accountDir, { recursive: true, force: true }));

function writeMessages(convId: string) {
  const msgDir = join(accountDir, convId, "messages");
  mkdirSync(msgDir, { recursive: true });
  writeFileSync(
    join(msgDir, "2025-01.jsonl"),
    `${JSON.stringify({
      urn: "urn:li:msg:1",
      timestamp: 1,
      fromUrn: "urn:li:member:1",
      fromName: "Syn User",
      isFromMe: false,
      body: "hello",
      reactions: [],
      attachments: [],
      originToken: null,
    })}\n`
  );
}

function conv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    convId: CONV_ID,
    profileId: "ACoSYNTH1",
    slug: "syn-user",
    convUrn: "",
    backendUrn: "",
    profileUrn: "",
    firstName: "Syn",
    lastName: "User",
    name: "Syn User",
    headline: null,
    unreadCount: 0,
    lastActivityAt: new Date().toISOString(),
    lastReadAt: null,
    read: true,
    ...overrides,
  };
}

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    name: "Syn User",
    slug: "syn-user",
    profileId: "ACoSYNTH1",
    convId: null,
    confidence: 1,
    ...overrides,
  };
}

describe("resolveNewConversationPick", () => {
  test("jumps to a thread already in the in-memory list, cursor included", () => {
    writeMessages(CONV_ID);
    const pick = resolveNewConversationPick(
      result({ convId: CONV_ID }),
      [conv({ convId: "2-OTHER", slug: "someone-else" }), conv()],
      accountDir
    );
    expect(pick.kind).toBe("open");
    if (pick.kind !== "open") return;
    expect(pick.convId).toBe(CONV_ID);
    expect(pick.cursorIdx).toBe(1);
    expect(pick.messages).toHaveLength(1);
  });

  test("opens a thread that exists on disk but not in the list yet", () => {
    writeMessages(CONV_ID);
    const pick = resolveNewConversationPick(result({ convId: CONV_ID }), [], accountDir);
    expect(pick.kind).toBe("open");
    if (pick.kind !== "open") return;
    expect(pick.cursorIdx).toBeNull();
    expect(pick.messages).toHaveLength(1);
  });

  test("falls back to the slug symlink when the search result has no convId", () => {
    writeMessages(CONV_ID);
    symlinkSync(CONV_ID, join(accountDir, "syn-user"));
    const pick = resolveNewConversationPick(result(), [], accountDir);
    expect(pick.kind).toBe("open");
    if (pick.kind !== "open") return;
    expect(pick.convId).toBe(CONV_ID);
    expect(pick.cursorIdx).toBeNull();
  });

  test("synthesizes a placeholder draft for a brand new conversation", () => {
    const pick = resolveNewConversationPick(result(), [], accountDir);
    expect(pick.kind).toBe("draft");
    if (pick.kind !== "draft") return;
    expect(pick.placeholder.convId).toBe("pending:syn-user");
    expect(pick.placeholder.slug).toBe("syn-user");
    expect(pick.placeholder.firstName).toBe("Syn");
    expect(pick.placeholder.lastName).toBe("User");
    expect(pick.placeholder.headline).toContain("new conversation");
  });

  test("single-word names keep the whole name as firstName and null lastName", () => {
    const pick = resolveNewConversationPick(result({ name: "Syn" }), [], accountDir);
    expect(pick.kind).toBe("draft");
    if (pick.kind !== "draft") return;
    expect(pick.placeholder.firstName).toBe("Syn");
    expect(pick.placeholder.lastName).toBeNull();
  });

  test("gives up when there is no slug to draft against", () => {
    const pick = resolveNewConversationPick(result({ slug: null }), [], accountDir);
    expect(pick).toEqual({ kind: "unavailable" });
  });
});
