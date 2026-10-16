/**
 * A seat's live link to its match's realtime channel (#114): joins the
 * private `match:{id}` channel to listen (it sends nothing, presence
 * included), passes on each `changed` signal's version, says whether the
 * channel is live, and reconnects after a growing delay when the channel errors, times out or
 * closes. While it is not live, the match sync polls every few seconds as
 * before (`matchSync.ts`). Pure apart from the injected channel and timers:
 * `supabaseClient.ts` opens the real channel, lazily, as the rest of
 * supabase-js is loaded.
 */
import { matchTopic, parseChangedSignal } from "./matchChannel";

/** supabase-js' channel states, as its `subscribe` callback reports them. */
export type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export interface MatchChannelHandlers {
  /** A `changed` broadcast's payload, unread. */
  onChanged(payload: unknown): void;
  onStatus(status: ChannelStatus): void;
}

export interface MatchChannel {
  close(): void;
}

/** Opens the private channel `topic`, to listen. */
export type OpenMatchChannel = (topic: string, handlers: MatchChannelHandlers) => Promise<MatchChannel>;

/** What a listener hears: each optional, so it names only the news it wants. */
export interface MatchLiveListener {
  onSignal?(v: number): void;
  onLive?(live: boolean): void;
}

/** The wait before reconnect attempt `attempt` (from 0): 1 s, doubling, at most a minute. */
export function reconnectDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 60_000);
}

interface MatchLiveOptions {
  /** The channel opener, loaded on first use (supabase-js is a chunk of its own). */
  open: () => Promise<OpenMatchChannel>;
  matchId: string;
}

export function createMatchLive({ open, matchId }: MatchLiveOptions) {
  const listeners = new Set<MatchLiveListener>();
  let running = false;
  let live = false;
  let attempt = 0;
  /** Bumped for every channel opened, so an old channel's late news is ignored. */
  let generation = 0;
  let channel: MatchChannel | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const setLive = (next: boolean) => {
    if (next === live) return;
    live = next;
    for (const l of listeners) l.onLive?.(live);
  };

  const closeChannel = () => {
    generation++;
    channel?.close();
    channel = null;
  };

  /** The channel is gone: fall back to polling, and try again after a while. */
  const lost = () => {
    closeChannel();
    setLive(false);
    if (!running) return;
    retry = setTimeout(connect, reconnectDelay(attempt));
    attempt++;
  };

  async function connect(): Promise<void> {
    retry = undefined;
    const mine = ++generation;
    const current = () => running && mine === generation;
    let opened: MatchChannel;
    try {
      const openChannel = await open();
      if (!current()) return;
      opened = await openChannel(matchTopic(matchId), {
        onChanged(payload) {
          const v = parseChangedSignal(payload);
          if (!current() || v === null) return;
          for (const l of listeners) l.onSignal?.(v);
        },
        onStatus(status) {
          if (!current()) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            setLive(true);
          } else {
            lost();
          }
        },
      });
    } catch {
      if (current()) lost();
      return;
    }
    if (current()) channel = opened;
    else opened.close();
  }

  return {
    /** Joins the channel. */
    start(): void {
      if (running) return;
      running = true;
      attempt = 0;
      void connect();
    },
    /** Leaves the channel (the board unmounted): no reconnecting after this. */
    stop(): void {
      running = false;
      if (retry !== undefined) clearTimeout(retry);
      retry = undefined;
      closeChannel();
      setLive(false);
    },
    /** Hears the link's news, starting with where it stands now; returns the unsubscribe. */
    subscribe(listener: MatchLiveListener): () => void {
      listeners.add(listener);
      listener.onLive?.(live);
      return () => void listeners.delete(listener);
    },
  };
}

export type MatchLive = ReturnType<typeof createMatchLive>;
