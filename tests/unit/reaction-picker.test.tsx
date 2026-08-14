import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { REACTION_PALETTE, ReactionPicker } from "../../src/components/ReactionPicker.tsx";
import type { Message } from "../../src/lib/types.ts";

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  urn: "urn:li:messagingMessage:test123",
  timestamp: Date.now(),
  fromUrn: "urn:li:fsd_profile:other",
  fromName: "Test User",
  isFromMe: false,
  body: "Hello world",
  reactions: [],
  attachments: [],
  ...overrides,
});

const noop = () => {};

describe("ReactionPicker", () => {
  it("exports the 6 LinkedIn default emojis", () => {
    expect(REACTION_PALETTE).toEqual(["👍", "❤️", "😂", "😮", "😢", "👏"]);
  });

  it("renders the message preview", () => {
    const { lastFrame } = render(
      <ReactionPicker
        message={makeMessage({ body: "Hello world" })}
        width={80}
        height={8}
        onPick={noop}
        onCancel={noop}
      />
    );
    expect(lastFrame()).toContain("Hello world");
  });

  it("renders the default emoji row with numbers", () => {
    const { lastFrame } = render(
      <ReactionPicker message={makeMessage()} width={80} height={8} onPick={noop} onCancel={noop} />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("1");
    expect(frame).toContain("👍");
    expect(frame).toContain("6");
    expect(frame).toContain("👏");
  });

  it("shows search prompt", () => {
    const { lastFrame } = render(
      <ReactionPicker message={makeMessage()} width={80} height={8} onPick={noop} onCancel={noop} />
    );
    expect(lastFrame()).toContain("type to search");
  });

  it("renders emoji grid", () => {
    const { lastFrame } = render(
      <ReactionPicker message={makeMessage()} width={80} height={8} onPick={noop} onCancel={noop} />
    );
    // Grid should show some emojis beyond the defaults
    const frame = lastFrame() ?? "";
    expect(frame).toContain("😀");
  });

  it("calls onPick with the right emoji on number key", () => {
    let picked: { emoji: string; unreact: boolean } | null = null;
    const { stdin } = render(
      <ReactionPicker
        message={makeMessage()}
        width={80}
        height={8}
        onPick={(emoji, unreact) => {
          picked = { emoji, unreact };
        }}
        onCancel={noop}
      />
    );
    stdin.write("1");
    expect(picked).toEqual({ emoji: "👍", unreact: false });
  });

  it("calls onPick with unreact=true when already reacted", () => {
    let picked: { emoji: string; unreact: boolean } | null = null;
    const { stdin } = render(
      <ReactionPicker
        message={makeMessage({
          reactions: [{ emoji: "👍", count: 1, hasUserReacted: true }],
        })}
        width={80}
        height={8}
        onPick={(emoji, unreact) => {
          picked = { emoji, unreact };
        }}
        onCancel={noop}
      />
    );
    stdin.write("1");
    expect(picked).toEqual({ emoji: "👍", unreact: true });
  });

  it("renders without crashing at small dimensions", () => {
    const { lastFrame } = render(
      <ReactionPicker message={makeMessage()} width={30} height={4} onPick={noop} onCancel={noop} />
    );
    expect(lastFrame()).toContain("👍");
  });

  it("truncates long message previews", () => {
    const longBody = "a".repeat(200);
    const { lastFrame } = render(
      <ReactionPicker
        message={makeMessage({ body: longBody })}
        width={60}
        height={8}
        onPick={noop}
        onCancel={noop}
      />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("…");
    // Should not contain the full 200-char string
    expect(frame).not.toContain(longBody);
  });
});
