import { describe, it, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { StatusBar } from "../../src/components/StatusBar.tsx";

const baseProps = {
  mode: "browse" as const,
  accountSlug: "testuser",
  totalConvs: 42,
  unreadConvs: 0,
  listenStatus: "connected" as const,
  lastBeatAt: Date.now(), // fresh heartbeat → live
  lastSyncAt: new Date().toISOString(),
  syncActivity: null,
  toast: null,
  width: 120,
};

describe("StatusBar", () => {
  it("renders the account slug", () => {
    const { lastFrame } = render(<StatusBar {...baseProps} />);
    expect(lastFrame()).toContain("testuser");
  });

  it("shows conversation count", () => {
    const { lastFrame } = render(<StatusBar {...baseProps} />);
    expect(lastFrame()).toContain("42");
    expect(lastFrame()).toContain("convs");
  });

  it("shows unread count when > 0", () => {
    const { lastFrame } = render(<StatusBar {...baseProps} unreadConvs={5} />);
    expect(lastFrame()).toContain("5 unread");
  });

  it("hides unread count when 0", () => {
    const { lastFrame } = render(<StatusBar {...baseProps} unreadConvs={0} />);
    expect(lastFrame()).not.toContain("unread");
  });

  it("shows 'live' when connected with fresh heartbeat", () => {
    const { lastFrame } = render(<StatusBar {...baseProps} />);
    expect(lastFrame()).toContain("live");
  });

  it("shows 'stale' when connected but heartbeat is old", () => {
    const { lastFrame } = render(
      <StatusBar {...baseProps} lastBeatAt={Date.now() - 120_000} />
    );
    expect(lastFrame()).toContain("stale");
  });

  it("shows 'starting' when listenStatus is starting", () => {
    const { lastFrame } = render(
      <StatusBar {...baseProps} listenStatus="starting" lastBeatAt={null} />
    );
    expect(lastFrame()).toContain("starting");
  });

  it("hides synced-ago when live", () => {
    const { lastFrame } = render(<StatusBar {...baseProps} />);
    expect(lastFrame()).not.toContain("synced");
  });

  it("shows synced-ago when disconnected", () => {
    const { lastFrame } = render(
      <StatusBar {...baseProps} listenStatus="disconnected" lastBeatAt={null} />
    );
    expect(lastFrame()).toContain("synced");
  });

  it("shows sync activity when syncing", () => {
    const { lastFrame } = render(
      <StatusBar
        {...baseProps}
        syncActivity={{
          scope: "inbox",
          label: "inbox",
          messagesFetched: 25,
          conversationsSeen: 3,
        }}
      />
    );
    expect(lastFrame()).toContain("syncing inbox");
    expect(lastFrame()).toContain("3c/25m");
  });

  it("shows toast message", () => {
    const { lastFrame } = render(
      <StatusBar {...baseProps} toast="message sent!" />
    );
    expect(lastFrame()).toContain("message sent!");
  });

  it("shows mode tag", () => {
    const { lastFrame } = render(<StatusBar {...baseProps} mode="compose" />);
    expect(lastFrame()).toContain("[compose]");
  });

  it("shows mode-specific hints for compose", () => {
    const { lastFrame } = render(<StatusBar {...baseProps} mode="compose" />);
    expect(lastFrame()).toContain("send");
    expect(lastFrame()).toContain("cancel");
  });

  it("shows '? help' hint in browse mode", () => {
    const { lastFrame } = render(<StatusBar {...baseProps} />);
    expect(lastFrame()).toContain("? help");
  });
});
