// Resolution logic for picking a person out of the `n` new-conversation
// search: decide whether the pick maps onto an existing thread (in memory, on
// disk, or via the slug symlink) or needs a placeholder draft. Pure store
// reads — the placeholder never touches disk; the first send creates the
// thread on LinkedIn.

import { loadMessages, resolveSlugToConvId } from "./allman.ts";
import type { Conversation, Message, SearchResult } from "./types.ts";

export type NewConversationPick =
  | {
      kind: "open";
      convId: string;
      messages: Message[];
      /** Sidebar index to jump to — null when the thread isn't in the in-memory list. */
      cursorIdx: number | null;
    }
  | { kind: "draft"; placeholder: Conversation }
  | { kind: "unavailable" };

export function resolveNewConversationPick(
  r: SearchResult,
  conversations: Conversation[],
  accountDir: string
): NewConversationPick {
  // If there's already a thread, jump to it. Otherwise, set up a stub
  // selection (no convId in store yet) and let the user compose; the
  // first send will create the thread on LinkedIn.
  if (r.convId) {
    const idx = conversations.findIndex((c) => c.convId === r.convId);
    if (idx >= 0) {
      return {
        kind: "open",
        convId: r.convId,
        messages: loadMessages(accountDir, r.convId),
        cursorIdx: idx,
      };
    }
    // The convId might exist on disk but not be in the in-memory list yet.
    const fromDisk = loadMessages(accountDir, r.convId);
    if (fromDisk.length > 0) {
      return { kind: "open", convId: r.convId, messages: fromDisk, cursorIdx: null };
    }
  }
  // Try resolving via slug symlink as a last resort.
  if (r.slug) {
    const cid = resolveSlugToConvId(accountDir, r.slug);
    if (cid) {
      return {
        kind: "open",
        convId: cid,
        messages: loadMessages(accountDir, cid),
        cursorIdx: null,
      };
    }
  }
  // Brand new conversation: synthesize a placeholder and let the user
  // compose. The first send will go via slug.
  if (r.slug) {
    const placeholder: Conversation = {
      convId: `pending:${r.slug}`,
      profileId: r.profileId,
      slug: r.slug,
      convUrn: "",
      backendUrn: "",
      profileUrn: "",
      firstName: r.name.split(" ")[0] ?? r.name,
      lastName: r.name.split(" ").slice(1).join(" ") || null,
      name: r.name,
      headline: "(new conversation — type a message and hit Enter)",
      unreadCount: 0,
      lastActivityAt: new Date().toISOString(),
      lastReadAt: null,
      read: true,
    };
    return { kind: "draft", placeholder };
  }
  return { kind: "unavailable" };
}
