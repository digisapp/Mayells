import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// public/sw.js is a plain script, so run it against a fake worker global and
// check what it intercepts. The cases that matter: it must never touch the
// rest of mayells.com, and a copy still registered for the whole site (from
// before it was scoped to /upload/) must step aside.

const SOURCE = readFileSync(path.resolve(__dirname, '../../../../public/sw.js'), 'utf8');
const ORIGIN = 'https://mayells.com';

function loadWorker(scope: string) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const registration = {
    scope: ORIGIN + scope,
    unregister: vi.fn(async () => true),
    navigationPreload: { enable: vi.fn(async () => {}), disable: vi.fn(async () => {}) },
  };
  const self = {
    registration,
    location: new URL(ORIGIN + '/sw.js'),
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners[type] = fn;
    },
  };
  const caches = {
    keys: vi.fn(async () => ['mayells-upload-v2', 'other-app']),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => undefined),
    open: vi.fn(async () => ({ put: vi.fn(async () => {}) })),
  };
  // Never the real network from a unit test.
  const fetch = vi.fn(async () => new Response('page', { status: 200 }));
  new Function('self', 'caches', 'fetch', SOURCE)(self, caches, fetch);

  async function activate() {
    let done: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  }

  function fetchEvent(url: string, init: { method?: string; mode?: string } = {}) {
    const respondWith = vi.fn((response: Promise<Response>) => response.catch(() => {}));
    listeners.fetch({
      request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' },
      respondWith,
      preloadResponse: Promise.resolve(undefined),
    });
    return respondWith.mock.calls.length > 0;
  }

  return { registration, self, caches, fetch, activate, fetchEvent };
}

describe('service worker (public/sw.js)', () => {
  it('only handles upload-page navigations', async () => {
    const sw = loadWorker('/upload/');
    expect(sw.fetchEvent(`${ORIGIN}/upload/abc123`, { mode: 'navigate' })).toBe(true);

    // Everything else goes straight to the network, untouched.
    expect(sw.fetchEvent(`${ORIGIN}/api/upload/abc123/signed-url`, { method: 'POST' })).toBe(false);
    expect(sw.fetchEvent(`${ORIGIN}/api/upload/abc123`)).toBe(false);
    expect(sw.fetchEvent('https://abcd.supabase.co/storage/v1/object/upload/sign/x', { method: 'PUT' })).toBe(false);
    expect(sw.fetchEvent('https://abcd.supabase.co/upload/thing', { mode: 'navigate' })).toBe(false);
    expect(sw.fetchEvent(`${ORIGIN}/_next/static/chunks/app.js`)).toBe(false);
    expect(sw.fetchEvent(`${ORIGIN}/lots`, { mode: 'navigate' })).toBe(false);
    expect(sw.fetchEvent(`${ORIGIN}/uploads-elsewhere`, { mode: 'navigate' })).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sw.fetch).toHaveBeenCalledTimes(1);
  });

  it('cleans up only its own old caches, and takes control of the upload pages', async () => {
    const sw = loadWorker('/upload/');
    await sw.activate();
    expect(sw.caches.delete).toHaveBeenCalledWith('mayells-upload-v2');
    expect(sw.caches.delete).not.toHaveBeenCalledWith('other-app');
    expect(sw.self.clients.claim).toHaveBeenCalled();
    expect(sw.registration.unregister).not.toHaveBeenCalled();
  });

  it('under an old site-wide registration, intercepts nothing and unregisters', async () => {
    const sw = loadWorker('/');
    expect(sw.fetchEvent(`${ORIGIN}/upload/abc123`, { mode: 'navigate' })).toBe(false);
    expect(sw.fetchEvent(`${ORIGIN}/lots`, { mode: 'navigate' })).toBe(false);
    await sw.activate();
    expect(sw.registration.unregister).toHaveBeenCalled();
    expect(sw.registration.navigationPreload.disable).toHaveBeenCalled();
    expect(sw.self.clients.claim).not.toHaveBeenCalled();
  });
});
