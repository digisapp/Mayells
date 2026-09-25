/**
 * One shared Realtime channel per topic, however many hooks listen to it.
 *
 * realtime-js hands back the SAME channel object for a topic that is already
 * joined, and a second `subscribe()` on it never calls back — so two
 * components on one topic (the live viewer and its chat, both on
 * `live:<auctionId>`) left one of them believing it was offline forever.
 * The hub opens a topic once, reference-counts its listeners, and fans out
 * both broadcasts and connection state.
 *
 * It also owns "resume": after a phone unlock, a bfcache restore or a network
 * change the socket can look open while being dead (the heartbeat only runs
 * every ~25s), so every channel is marked disconnected, the socket is dropped
 * and each topic is re-joined from scratch.
 *
 * The transport is injected so the bookkeeping is testable without a socket.
 */

export interface TopicTransport {
  /**
   * Join `topic`, reporting each broadcast and each subscribe status
   * ('SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'). Resolves to a
   * function that leaves the channel again.
   */
  open(
    topic: string,
    onEvent: (event: string, payload: unknown) => void,
    onStatus: (status: string) => void,
  ): Promise<() => Promise<void> | void>;
  /** Drop the underlying connection so the next open() dials a fresh one. */
  reset?(): Promise<void> | void;
}

export interface TopicListener {
  onEvent(event: string, payload: unknown): void;
  onConnectedChange(connected: boolean): void;
  /** The page came back (unlock, bfcache restore, network return): anything cached may be stale. */
  onResume?(): void;
}

interface Entry {
  listeners: Set<TopicListener>;
  connected: boolean;
  /** Bumped whenever the current channel is superseded; stale callbacks compare against it. */
  generation: number;
  close: (() => Promise<void> | void) | null;
}

export interface TopicHub {
  subscribe(topic: string, listener: TopicListener): () => void;
  /** Re-join every topic from scratch. Calls within `minResumeGapMs` of the last one are coalesced. */
  resume(): void;
  /** The network went away: report every topic as disconnected without tearing anything down. */
  markOffline(): void;
  isConnected(topic: string): boolean;
  /** Resolves once every queued open/close/resume has run (tests and teardown). */
  idle(): Promise<void>;
}

export function createTopicHub(
  transport: TopicTransport,
  { minResumeGapMs = 1000, now = () => Date.now() }: { minResumeGapMs?: number; now?: () => number } = {},
): TopicHub {
  const entries = new Map<string, Entry>();
  // Every open/close/resume runs strictly in order: realtime-js keys channels
  // by topic, so re-joining a topic before the previous channel has left
  // would get the leaving channel back.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch(() => {
      // A failed open leaves the topic disconnected; callers poll meanwhile.
    });
  };
  let lastResumeAt = -Infinity;

  const setConnected = (entry: Entry, connected: boolean) => {
    if (entry.connected === connected) return;
    entry.connected = connected;
    for (const listener of [...entry.listeners]) listener.onConnectedChange(connected);
  };

  const openEntry = async (topic: string, entry: Entry, generation: number) => {
    // Superseded (unsubscribed or resumed) before this task got its turn.
    if (entry.generation !== generation || entries.get(topic) !== entry) return;
    entry.close = await transport.open(
      topic,
      (event, payload) => {
        if (entry.generation !== generation) return;
        for (const listener of [...entry.listeners]) listener.onEvent(event, payload);
      },
      (status) => {
        if (entry.generation !== generation) return;
        setConnected(entry, status === 'SUBSCRIBED');
      },
    );
    // If the entry was superseded while opening, the close/resume task queued
    // behind this one sees `entry.close` and tears the channel down.
  };

  const closeEntry = async (entry: Entry) => {
    const close = entry.close;
    entry.close = null;
    if (close) await close();
  };

  return {
    subscribe(topic, listener) {
      let entry = entries.get(topic);
      if (!entry) {
        const created: Entry = { listeners: new Set(), connected: false, generation: 0, close: null };
        entries.set(topic, created);
        const generation = ++created.generation;
        enqueue(() => openEntry(topic, created, generation));
        entry = created;
      }
      entry.listeners.add(listener);
      const joined = entry;
      if (joined.connected) {
        // Already live: tell the newcomer, outside the caller's effect body.
        queueMicrotask(() => {
          if (joined.listeners.has(listener) && joined.connected) listener.onConnectedChange(true);
        });
      }

      let active = true;
      return () => {
        if (!active) return;
        active = false;
        joined.listeners.delete(listener);
        if (joined.listeners.size > 0 || entries.get(topic) !== joined) return;
        entries.delete(topic);
        joined.generation++;
        joined.connected = false;
        enqueue(() => closeEntry(joined));
      };
    },

    resume() {
      const at = now();
      if (at - lastResumeAt < minResumeGapMs) return;
      lastResumeAt = at;
      if (entries.size === 0) return;

      // Synchronously: the old channel is no longer trusted. Listeners poll
      // right away and tighten their fallback until the re-join lands.
      for (const entry of entries.values()) {
        entry.generation++;
        setConnected(entry, false);
        for (const listener of [...entry.listeners]) listener.onResume?.();
      }

      enqueue(async () => {
        // Drop the socket before leaving: on a half-dead connection a polite
        // leave would wait out its full timeout. A reset that fails (nothing
        // loaded yet, a socket already gone) must not cancel the re-join.
        try {
          await transport.reset?.();
        } catch {
          // the opens below dial afresh regardless
        }
        const current = [...entries];
        for (const [, entry] of current) {
          try {
            await closeEntry(entry);
          } catch {
            // a channel that can't leave politely is dropped with the socket
          }
        }
        // Each topic on its own: one failed join must not strand the rest.
        // A topic that fails stays disconnected (callers poll) and is joined
        // again on the next resume.
        for (const [topic, entry] of current) {
          if (entries.get(topic) !== entry) continue;
          try {
            await openEntry(topic, entry, ++entry.generation);
          } catch {
            // retried on the next resume
          }
        }
      });
    },

    markOffline() {
      for (const entry of entries.values()) setConnected(entry, false);
    },

    isConnected(topic) {
      return entries.get(topic)?.connected ?? false;
    },

    idle() {
      return queue;
    },
  };
}

/**
 * A lazily loaded singleton that forgets a failed load, so the next `get()`
 * tries again instead of inheriting the rejection until the page reloads
 * (one dropped script download on a flaky phone connection would otherwise
 * disable realtime for the rest of the visit). `peek()` returns the load in
 * progress or done, without starting one.
 */
export function retryingLoader<T>(load: () => Promise<T>): { get(): Promise<T>; peek(): Promise<T> | null } {
  let current: Promise<T> | null = null;
  return {
    get() {
      if (!current) {
        const loading = load();
        current = loading;
        // Registered before any caller's handler, so by the time a caller
        // sees the rejection the slot is already free for its retry.
        loading.catch(() => {
          if (current === loading) current = null;
        });
      }
      return current;
    },
    peek: () => current,
  };
}

/**
 * Wire a hub to the browser's "we're back" signals. `visibilitychange` covers
 * unlock and tab return, `pageshow` a bfcache restore (no visibility change
 * fires), `online` a network return. Returns a function that unwires them.
 */
export function bindResumeTriggers(hub: TopicHub): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') hub.resume();
  };
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) hub.resume();
  };
  const onOnline = () => hub.resume();
  const onOffline = () => hub.markOffline();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
