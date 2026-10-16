import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchLive, reconnectDelay, type ChannelStatus, type MatchChannelHandlers, type OpenMatchChannel } from "./matchLive";

const MATCH = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";

interface OpenedChannel {
  topic: string;
  presenceKey: string;
  handlers: MatchChannelHandlers;
  tracked: unknown[];
  closed: boolean;
}

function fakeRealtime() {
  const opened: OpenedChannel[] = [];
  let failNext = 0;
  const open: OpenMatchChannel = async (topic, presenceKey, handlers) => {
    if (failNext > 0) {
      failNext--;
      throw new Error("could not open");
    }
    const channel: OpenedChannel = { topic, presenceKey, handlers, tracked: [], closed: false };
    opened.push(channel);
    return {
      track: (presence) => void channel.tracked.push(presence),
      close: () => {
        channel.closed = true;
      },
    };
  };
  return {
    opened,
    open,
    failOpens: (n: number) => (failNext = n),
    last: () => opened[opened.length - 1],
    status: (s: ChannelStatus) => opened[opened.length - 1].handlers.onStatus(s),
  };
}

function recorder() {
  const events: string[] = [];
  return {
    events,
    listener: {
      onSignal: (v: number) => events.push(`signal ${v}`),
      onLive: (live: boolean) => events.push(live ? "live" : "not live"),
      onOnline: (seats: readonly string[] | null) => events.push(`online ${seats === null ? "unknown" : seats.join(",")}`),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a seat's live link to its match's channel (#114)", () => {
  it("joins the match's private channel under its seat, and tracks only that it is online once subscribed", async () => {
    const rt = fakeRealtime();
    const live = createMatchLive({ open: async () => rt.open, matchId: MATCH });
    const { events, listener } = recorder();
    live.subscribe(listener);
    live.start("1");
    await vi.advanceTimersByTimeAsync(0);
    expect(rt.opened).toHaveLength(1);
    expect(rt.last().topic).toBe(`match:${MATCH}`);
    expect(rt.last().presenceKey).toBe("1");
    expect(rt.last().tracked).toEqual([]);
    rt.status("SUBSCRIBED");
    expect(rt.last().tracked).toEqual([{ online: true }]);
    expect(events).toEqual(["not live", "online unknown", "live"]);
  });

  it("passes on each 'changed' signal's version, and nothing for a payload that is not one", async () => {
    const rt = fakeRealtime();
    const live = createMatchLive({ open: async () => rt.open, matchId: MATCH });
    const { events, listener } = recorder();
    live.start("0");
    await vi.advanceTimersByTimeAsync(0);
    rt.status("SUBSCRIBED");
    live.subscribe(listener);
    events.length = 0;
    rt.last().handlers.onChanged({ v: 9 });
    rt.last().handlers.onChanged({ G: {} });
    rt.last().handlers.onChanged("9");
    expect(events).toEqual(["signal 9"]);
  });

  it("says which seats are online from presence, and nothing once the channel is down", async () => {
    const rt = fakeRealtime();
    const live = createMatchLive({ open: async () => rt.open, matchId: MATCH });
    const { events, listener } = recorder();
    live.subscribe(listener);
    live.start("0");
    await vi.advanceTimersByTimeAsync(0);
    rt.status("SUBSCRIBED");
    events.length = 0;
    rt.last().handlers.onPresence(["1", "0", "spy"]);
    expect(events).toEqual(["online 0,1"]);
    rt.status("CHANNEL_ERROR");
    expect(events).toEqual(["online 0,1", "not live", "online unknown"]);
  });

  it("on an error, a time-out or a close, falls back and reconnects after a growing delay, starting over once subscribed", async () => {
    const rt = fakeRealtime();
    const live = createMatchLive({ open: async () => rt.open, matchId: MATCH });
    live.start("0");
    await vi.advanceTimersByTimeAsync(0);
    for (const [i, status] of (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"] as const).entries()) {
      rt.status(status);
      expect(rt.last().closed).toBe(true);
      await vi.advanceTimersByTimeAsync(reconnectDelay(i) - 1);
      expect(rt.opened).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(rt.opened).toHaveLength(i + 2);
    }
    rt.status("SUBSCRIBED");
    rt.status("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(reconnectDelay(0));
    expect(rt.opened).toHaveLength(5);
  });

  it("grows the delay to a cap", () => {
    expect(reconnectDelay(0)).toBe(1000);
    expect(reconnectDelay(1)).toBe(2000);
    expect(reconnectDelay(3)).toBe(8000);
    expect(reconnectDelay(20)).toBe(60_000);
  });

  it("retries when the channel cannot even be opened (supabase-js failed to load, no session)", async () => {
    const rt = fakeRealtime();
    rt.failOpens(1);
    const live = createMatchLive({ open: async () => rt.open, matchId: MATCH });
    live.start("0");
    await vi.advanceTimersByTimeAsync(0);
    expect(rt.opened).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(reconnectDelay(0));
    expect(rt.opened).toHaveLength(1);
  });

  it("ignores what an old channel says after it was replaced", async () => {
    const rt = fakeRealtime();
    const live = createMatchLive({ open: async () => rt.open, matchId: MATCH });
    const { events, listener } = recorder();
    live.subscribe(listener);
    live.start("0");
    await vi.advanceTimersByTimeAsync(0);
    const old = rt.last();
    rt.status("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(reconnectDelay(0));
    rt.status("SUBSCRIBED");
    events.length = 0;
    old.handlers.onStatus("CLOSED");
    old.handlers.onChanged({ v: 3 });
    old.handlers.onPresence(["2"]);
    expect(events).toEqual([]);
    expect(rt.opened).toHaveLength(2);
  });

  it("closes its channel when stopped (the board unmounted), and never reconnects", async () => {
    const rt = fakeRealtime();
    const live = createMatchLive({ open: async () => rt.open, matchId: MATCH });
    const { events, listener } = recorder();
    live.subscribe(listener);
    live.start("0");
    await vi.advanceTimersByTimeAsync(0);
    rt.status("SUBSCRIBED");
    rt.last().handlers.onPresence(["0"]);
    events.length = 0;
    live.stop();
    expect(rt.last().closed).toBe(true);
    expect(events).toEqual(["not live", "online unknown"]);
    rt.status("CLOSED");
    await vi.advanceTimersByTimeAsync(reconnectDelay(10));
    expect(rt.opened).toHaveLength(1);
  });

  it("closes a channel that opens only after it was stopped", async () => {
    const rt = fakeRealtime();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const live = createMatchLive({ open: async () => (await gate, rt.open), matchId: MATCH });
    live.start("0");
    live.stop();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(rt.opened.every((c) => c.closed)).toBe(true);
  });

  it("stops hearing a listener that unsubscribed", async () => {
    const rt = fakeRealtime();
    const live = createMatchLive({ open: async () => rt.open, matchId: MATCH });
    const { events, listener } = recorder();
    const unsubscribe = live.subscribe(listener);
    live.start("0");
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    events.length = 0;
    rt.status("SUBSCRIBED");
    rt.last().handlers.onChanged({ v: 2 });
    expect(events).toEqual([]);
  });
});
