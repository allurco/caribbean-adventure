/**
 * A seat's live link to its match's realtime channel (#114): joins the
 * private `match:{id}` channel, passes on each `changed` signal's version,
 * says whether the channel is live and which seats are online, and
 * reconnects after a growing delay when the channel errors, times out or
 * closes. While it is not live, the match sync polls every few seconds as
 * before (`matchSync.ts`). Pure apart from the injected channel and timers:
 * `supabaseClient.ts` opens the real channel, lazily, as the rest of
 * supabase-js is loaded.
 */
import { matchTopic, onlineSeatsFrom, parseChangedSignal, SEAT_PRESENCE } from "./matchChannel";

/** supabase-js' channel states, as its `subscribe` callback reports them. */
export type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";

export interface MatchChannelHandlers {
  /** A `changed` broadcast's payload, unread. */
  onChanged(payload: unknown): void;
  /** The presence keys on the channel, after each presence sync. */
  onPresence(keys: string[]): void;
  onStatus(status: ChannelStatus): void;
}

export interface MatchChannel {
  track(presence: typeof SEAT_PRESENCE): void;
  close(): void;
}

/** Opens the private channel `topic`, with `presenceKey` as this client's presence key. */
export type OpenMatchChannel = (topic: string, presenceKey: string, handlers: MatchChannelHandlers) => Promise<MatchChannel>;

export interface MatchLiveListener {
  onSignal(v: number): void;
  onLive(live: boolean): void;
  /** The seats online, or null while the channel is not live (unknown, not "nobody"). */
  onOnline(seats: readonly string[] | null): void;
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
  let online: readonly string[] | null = null;
  let attempt = 0;
  /** Bumped for every channel opened, so an old channel's late news is ignored. */
  let generation = 0;
  let channel: MatchChannel | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  /** The seat this client holds: its presence key. */
  let seat = "";

  const setLive = (next: boolean) => {
    if (next === live) return;
    live = next;
    for (const l of listeners) l.onLive(live);
  };
  const setOnline = (next: readonly string[] | null) => {
    if (next === null && online === null) return;
    online = next;
    for (const l of listeners) l.onOnline(online);
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
    setOnline(null);
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
      opened = await openChannel(matchTopic(matchId), seat, {
        onChanged(payload) {
          const v = parseChangedSignal(payload);
          if (!current() || v === null) return;
          for (const l of listeners) l.onSignal(v);
        },
        onPresence(keys) {
          if (current() && live) setOnline(onlineSeatsFrom(keys));
        },
        onStatus(status) {
          if (!current()) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            setLive(true);
            channel?.track(SEAT_PRESENCE);
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
    /** Joins the channel as `ownSeat`, the seat this client holds. */
    start(ownSeat: string): void {
      if (running) return;
      running = true;
      seat = ownSeat;
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
      setOnline(null);
    },
    /** Hears the link's news, starting with where it stands now; returns the unsubscribe. */
    subscribe(listener: MatchLiveListener): () => void {
      listeners.add(listener);
      listener.onLive(live);
      listener.onOnline(online);
      return () => void listeners.delete(listener);
    },
  };
}

export type MatchLive = ReturnType<typeof createMatchLive>;
