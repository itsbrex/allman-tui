/**
 * The thread header shows the enriched profile summary when the contact has
 * been enriched, and falls back to the LinkedIn headline otherwise.
 *
 * All names/slugs are synthetic.
 */
import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";

import { Thread } from "../../src/components/Thread.tsx";
import type { Conversation } from "../../src/lib/types.ts";

const conversation = {
  convId: "2-synthetic",
  profileId: "ACoSYNTH0000000000000000000000000000001",
  slug: "syn-user",
  name: "Syn Thetic",
  headline: "Stale headline from LinkedIn",
  unreadCount: 0,
} as unknown as Conversation;

const baseProps = {
  conversation,
  messages: [],
  width: 120,
  height: 20,
  scrollOffset: 0,
  selectedMessageUrn: null,
};

describe("Thread header", () => {
  it("shows the enrichment summary when one is available", () => {
    const { lastFrame } = render(
      <Thread {...baseProps} profileSummary="Staff Engineer at Test Co — Testville" />
    );
    expect(lastFrame()).toContain("Staff Engineer at Test Co");
    // The stale headline gives way to the enriched role.
    expect(lastFrame()).not.toContain("Stale headline");
  });

  it("falls back to the headline when the contact is not enriched", () => {
    const { lastFrame } = render(<Thread {...baseProps} profileSummary={null} />);
    expect(lastFrame()).toContain("Stale headline from LinkedIn");
  });

  it("still renders the contact name and slug", () => {
    const { lastFrame } = render(<Thread {...baseProps} profileSummary="CTO at Test Co" />);
    expect(lastFrame()).toContain("Syn Thetic");
    expect(lastFrame()).toContain("syn-user");
  });

  it("does not break when the prop is omitted entirely", () => {
    const { lastFrame } = render(<Thread {...baseProps} />);
    expect(lastFrame()).toContain("Stale headline from LinkedIn");
  });
});
