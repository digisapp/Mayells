import { describe, it, expect, vi } from 'vitest';
import { createTopicHub, retryingLoader, type TopicListener, type TopicTransport } from '../realtime-hub';

/** In-memory transport: records every open/close and lets a test drive status and events. */
function fakeTransport() {
  const channels: {
    topic: string;
    emit: (event: string, payload?: unknown) => void;
    status: (s: string) => void;
    closed: boolean;
  }[] = [];
  const log: string[] = [];
  const transport: TopicTransport = {
    open: vi.fn(async (topic, onEvent, onStatus) => {
      const ch = { topic, emit: (e: string, p?: unknown) => onEvent(e, p), status: onStatus, closed: false };
      channels.push(ch);
      log.push(`open ${topic}`);
      return async () => {
        ch.closed = true;
        log.push(`close ${topic}`);
      };
    }),
    reset: vi.fn(async () => {
      log.push('reset');
    }),
  };
  const live = (topic: string) => channels.filter((c) => c.topic === topic && !c.closed);
  return { transport, channels, log, live };
}

function listener(): TopicListener & { events: string[]; states: boolean[]; resumes: number } {
  const l = {
    events: [] as string[],
    states: [] as boolean[],
    resumes: 0,
    onEvent: (event: string) => l.events.push(event),
    onConnectedChange: (c: boolean) => l.states.push(c),
    onResume: () => { l.resumes++; },
  };
  return l;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createTopicHub', () => {
  it('opens one channel per topic no matter how many listeners join', async () => {
    const t = fakeTransport();
    const hub = createTopicHub(t.transport);
    const viewer = listener();
    const chat = listener();
    hub.subscribe('live:a', viewer);
    hub.subscribe('live:a', chat);
    await hub.idle();
    expect(t.transport.open).toHaveBeenCalledTimes(1);
  });

  it('fans connection state out to every listener, including late joiners', async () => {
    const t = fakeTransport();
    const hub = createTopicHub(t.transport);
    const viewer = listener();
    hub.subscribe('live:a', viewer);
    await hub.idle();
    t.live('live:a')[0].status('SUBSCRIBED');
    expect(viewer.states).toEqual([true]);

    // The second subscriber on an already-joined topic must still hear "connected"
    // (with a bare realtime-js channel its subscribe() would never call back).
    const chat = listener();
    hub.subscribe('live:a', chat);
    await flush();
    expect(chat.states).toEqual([true]);
    expect(hub.isConnected('live:a')).toBe(true);

    t.live('live:a')[0].status('CHANNEL_ERROR');
    expect(viewer.states).toEqual([true, false]);
    expect(chat.states).toEqual([true, false]);
  });

  it('fans every broadcast out to every listener', async () => {
    const t = fakeTransport();
    const hub = createTopicHub(t.transport);
    const a = listener();
    const b = listener();
    hub.subscribe('live:a', a);
    hub.subscribe('live:a', b);
    await hub.idle();
    t.live('live:a')[0].emit('chat');
    t.live('live:a')[0].emit('lot_bid');
    expect(a.events).toEqual(['chat', 'lot_bid']);
    expect(b.events).toEqual(['chat', 'lot_bid']);
  });

  it('keeps the channel until the last listener leaves, then closes it once', async () => {
    const t = fakeTransport();
    const hub = createTopicHub(t.transport);
    const a = listener();
    const b = listener();
    const offA = hub.subscribe('lot:1', a);
    const offB = hub.subscribe('lot:1', b);
    await hub.idle();

    offA();
    offA(); // double cleanup is harmless
    await hub.idle();
    expect(t.live('lot:1')).toHaveLength(1);
    t.live('lot:1')[0].emit('bid');
    expect(a.events).toEqual([]);
    expect(b.events).toEqual(['bid']);

    offB();
    await hub.idle();
    expect(t.live('lot:1')).toHaveLength(0);
    expect(t.log).toEqual(['open lot:1', 'close lot:1']);
  });

  it('closes the old channel before re-opening the same topic (unmount + remount)', async () => {
    const t = fakeTransport();
    const hub = createTopicHub(t.transport);
    const off = hub.subscribe('lot:1', listener());
    off();
    hub.subscribe('lot:1', listener());
    await hub.idle();
    // The first open never happened (superseded before its turn); one live channel remains.
    expect(t.live('lot:1')).toHaveLength(1);
    expect(t.log).toEqual(['open lot:1']);
  });

  it('closes a channel whose last listener left while it was still opening', async () => {
    const t = fakeTransport();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const open = t.transport.open;
    t.transport.open = vi.fn(async (...args: Parameters<TopicTransport['open']>) => {
      await gate;
      return open(...args);
    });
    const hub = createTopicHub(t.transport);
    const off = hub.subscribe('lot:1', listener());
    await flush();
    off();
    release();
    await hub.idle();
    expect(t.live('lot:1')).toHaveLength(0);
    expect(t.log).toEqual(['open lot:1', 'close lot:1']);
  });

  it('ignores status and events from a superseded channel', async () => {
    const t = fakeTransport();
    const hub = createTopicHub(t.transport, { minResumeGapMs: 0 });
    const a = listener();
    hub.subscribe('lot:1', a);
    await hub.idle();
    const stale = t.live('lot:1')[0];
    hub.resume();
    await hub.idle();
    stale.status('SUBSCRIBED');
    stale.emit('bid');
    expect(a.states).toEqual([]);
    expect(a.events).toEqual([]);
  });

  describe('resume', () => {
    it('marks topics disconnected at once, drops the socket, then re-joins every topic', async () => {
      const t = fakeTransport();
      const hub = createTopicHub(t.transport);
      const lot = listener();
      const live = listener();
      hub.subscribe('lot:1', lot);
      hub.subscribe('live:a', live);
      await hub.idle();
      t.live('lot:1')[0].status('SUBSCRIBED');
      t.live('live:a')[0].status('SUBSCRIBED');

      hub.resume();
      // Synchronous: callers can poll immediately and tighten their fallback.
      expect(lot.states).toEqual([true, false]);
      expect(live.states).toEqual([true, false]);
      expect(lot.resumes).toBe(1);
      expect(hub.isConnected('lot:1')).toBe(false);

      await hub.idle();
      expect(t.log).toEqual([
        'open lot:1', 'open live:a',
        'reset', 'close lot:1', 'close live:a',
        'open lot:1', 'open live:a',
      ]);
      t.live('lot:1')[0].status('SUBSCRIBED');
      expect(lot.states).toEqual([true, false, true]);
      t.live('lot:1')[0].emit('bid');
      expect(lot.events).toEqual(['bid']);
    });

    it('coalesces the burst of signals an unlock produces', async () => {
      let clock = 10_000;
      const t = fakeTransport();
      const hub = createTopicHub(t.transport, { minResumeGapMs: 1000, now: () => clock });
      const l = listener();
      hub.subscribe('lot:1', l);
      await hub.idle();

      hub.resume(); // visibilitychange
      hub.resume(); // pageshow
      clock += 400;
      hub.resume(); // online
      await hub.idle();
      expect(l.resumes).toBe(1);
      expect(t.transport.reset).toHaveBeenCalledTimes(1);

      clock += 5000;
      hub.resume();
      await hub.idle();
      expect(l.resumes).toBe(2);
    });

    it('does nothing when no topic is subscribed', async () => {
      const t = fakeTransport();
      const hub = createTopicHub(t.transport);
      hub.resume();
      await hub.idle();
      expect(t.transport.reset).not.toHaveBeenCalled();
    });

    it('does not re-open a topic whose listeners left before the resume ran', async () => {
      const t = fakeTransport();
      const hub = createTopicHub(t.transport, { minResumeGapMs: 0 });
      const off = hub.subscribe('lot:1', listener());
      await hub.idle();
      hub.resume();
      off();
      await hub.idle();
      expect(t.live('lot:1')).toHaveLength(0);
    });

    it('keeps working when a transport open fails', async () => {
      const t = fakeTransport();
      const open = t.transport.open;
      let fail = true;
      t.transport.open = vi.fn(async (...args: Parameters<TopicTransport['open']>) => {
        if (fail) throw new Error('socket unavailable');
        return open(...args);
      });
      const hub = createTopicHub(t.transport, { minResumeGapMs: 0 });
      const l = listener();
      hub.subscribe('lot:1', l);
      await hub.idle();
      expect(hub.isConnected('lot:1')).toBe(false);

      fail = false;
      hub.resume();
      await hub.idle();
      t.live('lot:1')[0].status('SUBSCRIBED');
      expect(l.states).toEqual([true]);
    });
  });

  describe('a failed client download', () => {
    it('re-joins on the next resume when the first open rejects and a later one succeeds', async () => {
      const t = fakeTransport();
      const open = t.transport.open;
      // What useRealtimeTopic's transport does: every open awaits the lazily
      // downloaded client. The first download fails; the retry succeeds.
      let downloads = 0;
      const client = retryingLoader(async () => {
        downloads++;
        if (downloads === 1) throw new Error('ChunkLoadError');
        return { disconnect: vi.fn() };
      });
      t.transport.open = vi.fn(async (...args: Parameters<TopicTransport['open']>) => {
        await client.get();
        return open(...args);
      });
      // A reset that rethrows the failed load must not abort the resume.
      t.transport.reset = vi.fn(async () => {
        const loading = client.peek();
        if (loading) await loading;
      });
      const hub = createTopicHub(t.transport, { minResumeGapMs: 0 });
      const lot = listener();
      const live = listener();
      hub.subscribe('lot:1', lot);
      hub.subscribe('live:a', live);
      await hub.idle();
      expect(t.live('lot:1')).toHaveLength(0);

      hub.resume();
      await hub.idle();
      expect(downloads).toBe(2);
      t.live('lot:1')[0].status('SUBSCRIBED');
      t.live('live:a')[0].status('SUBSCRIBED');
      expect(lot.states).toEqual([true]);
      expect(live.states).toEqual([true]);
    });

    it('re-joins every topic even when the transport reset throws', async () => {
      const t = fakeTransport();
      t.transport.reset = vi.fn(() => {
        throw new Error('client never loaded');
      });
      const hub = createTopicHub(t.transport, { minResumeGapMs: 0 });
      hub.subscribe('lot:1', listener());
      hub.subscribe('live:a', listener());
      await hub.idle();
      hub.resume();
      await hub.idle();
      expect(t.log).toEqual(['open lot:1', 'open live:a', 'close lot:1', 'close live:a', 'open lot:1', 'open live:a']);
    });

    it("doesn't let one topic's failed join block the others, and retries it on the next resume", async () => {
      const t = fakeTransport();
      const open = t.transport.open;
      let failLot = false;
      t.transport.open = vi.fn(async (...args: Parameters<TopicTransport['open']>) => {
        if (failLot && args[0] === 'lot:1') throw new Error('join failed');
        return open(...args);
      });
      const hub = createTopicHub(t.transport, { minResumeGapMs: 0 });
      const lot = listener();
      const live = listener();
      hub.subscribe('lot:1', lot);
      hub.subscribe('live:a', live);
      await hub.idle();

      failLot = true;
      hub.resume();
      await hub.idle();
      expect(t.live('lot:1')).toHaveLength(0);
      expect(t.live('live:a')).toHaveLength(1);

      failLot = false;
      hub.resume();
      await hub.idle();
      expect(t.live('lot:1')).toHaveLength(1);
      t.live('lot:1')[0].status('SUBSCRIBED');
      expect(hub.isConnected('lot:1')).toBe(true);
    });
  });

  it('markOffline reports every topic disconnected without tearing down', async () => {
    const t = fakeTransport();
    const hub = createTopicHub(t.transport);
    const l = listener();
    hub.subscribe('lot:1', l);
    await hub.idle();
    t.live('lot:1')[0].status('SUBSCRIBED');
    hub.markOffline();
    expect(l.states).toEqual([true, false]);
    expect(t.live('lot:1')).toHaveLength(1);
  });
});

describe('retryingLoader', () => {
  it('loads once and shares the result', async () => {
    const load = vi.fn(async () => 'client');
    const loader = retryingLoader(load);
    expect(loader.peek()).toBeNull();
    await expect(Promise.all([loader.get(), loader.get()])).resolves.toEqual(['client', 'client']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed load, so the next get() tries again', async () => {
    let attempt = 0;
    const loader = retryingLoader(async () => {
      if (++attempt === 1) throw new Error('ChunkLoadError');
      return 'client';
    });
    await expect(loader.get()).rejects.toThrow('ChunkLoadError');
    expect(loader.peek()).toBeNull();
    await expect(loader.get()).resolves.toBe('client');
    expect(attempt).toBe(2);
  });
});
