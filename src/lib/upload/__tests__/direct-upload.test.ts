import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isRetryable, uploadPhotosDirect, uploadPhotosDirectEach, uploadPhotosWithDeadline } from '../direct-upload';
import type { PageClock } from '../visible-time';

// Fast retries/timeouts so the real backoff and AbortController paths run.
const FAST = { timeoutMs: 40, backoffMs: 1 };

const photo = (name: string) => new File([new Uint8Array(1024)], name, { type: 'image/jpeg' });

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

/** Mint a signed URL per file; PUTs go to `handlers[file name]` in call order. */
function mockStorage(puts: Record<string, Handler[]>, mint?: Handler[]) {
  const calls: { method: string; url: string }[] = [];
  const mintQueue = [...(mint ?? [])];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({ method, url });
    if (url === '/api/appraisal-requests/upload-urls') {
      const next = mintQueue.shift();
      if (next) return next(url, init);
      const { files } = JSON.parse(String(init.body)) as { files: { name: string }[] };
      return Response.json(
        {
          data: {
            uploads: files.map((f, index) => ({
              index,
              path: `submissions/${f.name}`,
              signedUrl: `https://storage.test/${f.name}`,
            })),
          },
        },
        { status: 201 },
      );
    }
    const name = url.split('/').pop()!;
    const handler = puts[name]?.shift();
    if (!handler) throw new Error(`unexpected PUT ${name}`);
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  const putsTo = (name: string) => calls.filter((c) => c.method === 'PUT' && c.url.endsWith(`/${name}`)).length;
  return { calls, putsTo };
}

const ok: Handler = () => new Response(null, { status: 200 });
const status = (code: number, body = ''): Handler => () => new Response(body, { status: code });
const drop: Handler = () => Promise.reject(new TypeError('Load failed'));
/** Never answers; only the caller's timeout (AbortSignal) ends it. */
const hang: Handler = (_url, init) =>
  new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isRetryable', () => {
  it('retries network errors, timeouts and 5xx', () => {
    expect(isRetryable('network')).toBe(true);
    expect(isRetryable('timeout')).toBe(true);
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
  });

  it('never retries 4xx', () => {
    for (const s of [400, 401, 403, 404, 408, 409, 413, 429]) {
      expect(isRetryable({ status: s })).toBe(false);
    }
  });
});

describe('uploadPhotosDirectEach', () => {
  it('uploads every photo once when storage answers', async () => {
    const { putsTo } = mockStorage({ 'a.jpg': [ok], 'b.jpg': [ok] });
    const out = await uploadPhotosDirectEach([photo('a.jpg'), photo('b.jpg')], undefined, FAST);
    expect(out).toEqual(['submissions/a.jpg', 'submissions/b.jpg']);
    expect(putsTo('a.jpg')).toBe(1);
  });

  it('retries a 5xx and a dropped connection, then succeeds', async () => {
    const { putsTo } = mockStorage({ 'a.jpg': [status(503), drop, ok] });
    const out = await uploadPhotosDirectEach([photo('a.jpg')], undefined, FAST);
    expect(out).toEqual(['submissions/a.jpg']);
    expect(putsTo('a.jpg')).toBe(3);
  });

  it('gives up after two retries', async () => {
    const { putsTo } = mockStorage({ 'a.jpg': [status(500), status(502), status(500)] });
    expect(await uploadPhotosDirectEach([photo('a.jpg')], undefined, FAST)).toEqual([null]);
    expect(putsTo('a.jpg')).toBe(3);
  });

  it('never retries a 4xx', async () => {
    const { putsTo } = mockStorage({ 'a.jpg': [status(403)], 'b.jpg': [status(400)] });
    expect(await uploadPhotosDirectEach([photo('a.jpg'), photo('b.jpg')], undefined, FAST)).toEqual([null, null]);
    expect(putsTo('a.jpg')).toBe(1);
    expect(putsTo('b.jpg')).toBe(1);
  });

  it('times out a stalled upload and retries it', async () => {
    const { putsTo } = mockStorage({ 'a.jpg': [hang, ok] });
    const out = await uploadPhotosDirectEach([photo('a.jpg')], undefined, FAST);
    expect(out).toEqual(['submissions/a.jpg']);
    expect(putsTo('a.jpg')).toBe(2);
  });

  it('fails a photo whose every attempt times out', async () => {
    mockStorage({ 'a.jpg': [hang, hang, hang] });
    expect(await uploadPhotosDirectEach([photo('a.jpg')], undefined, FAST)).toEqual([null]);
  });

  it('counts a retry that finds the photo already stored as uploaded', async () => {
    // First attempt landed but its response was lost; storage then says 409.
    mockStorage({
      'a.jpg': [hang, status(409)],
      'b.jpg': [drop, status(400, '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}')],
    });
    const out = await uploadPhotosDirectEach([photo('a.jpg'), photo('b.jpg')], undefined, FAST);
    expect(out).toEqual(['submissions/a.jpg', 'submissions/b.jpg']);
  });

  it('does not treat a first-attempt 409 as success', async () => {
    mockStorage({ 'a.jpg': [status(409)] });
    expect(await uploadPhotosDirectEach([photo('a.jpg')], undefined, FAST)).toEqual([null]);
  });

  it('reports progress per finished photo, not per attempt', async () => {
    mockStorage({ 'a.jpg': [status(500), ok], 'b.jpg': [ok], 'c.jpg': [status(403)] });
    const progress: [number, number][] = [];
    await uploadPhotosDirectEach(
      [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')],
      (done, total) => progress.push([done, total]),
      FAST,
    );
    expect(progress).toHaveLength(3);
    expect(progress.map(([d]) => d)).toEqual([1, 2, 3]);
    expect(progress.every(([, t]) => t === 3)).toBe(true);
  });

  it('counts files the server declined to sign as finished (and failed)', async () => {
    mockStorage({ 'a.jpg': [ok] }, [
      () =>
        Response.json(
          { data: { uploads: [{ index: 0, path: 'submissions/a.jpg', signedUrl: 'https://storage.test/a.jpg' }] } },
          { status: 201 },
        ),
    ]);
    const progress: number[] = [];
    const out = await uploadPhotosDirectEach([photo('a.jpg'), photo('b.tiff')], (d) => progress.push(d), FAST);
    expect(out).toEqual(['submissions/a.jpg', null]);
    expect(progress).toEqual([1, 2]);
  });

  it('retries minting upload URLs on a 5xx', async () => {
    const { calls } = mockStorage({ 'a.jpg': [ok] }, [status(500)]);
    expect(await uploadPhotosDirectEach([photo('a.jpg')], undefined, FAST)).toEqual(['submissions/a.jpg']);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('throws when upload URLs are refused (e.g. rate limited), without retrying', async () => {
    const { calls } = mockStorage({}, [status(429)]);
    await expect(uploadPhotosDirectEach([photo('a.jpg')], undefined, FAST)).rejects.toThrow(
      'Could not prepare photo upload',
    );
    expect(calls).toHaveLength(1);
  });

  it('throws when upload URLs never come back', async () => {
    mockStorage({}, [drop, drop, drop]);
    await expect(uploadPhotosDirectEach([photo('a.jpg')], undefined, FAST)).rejects.toThrow(
      'Could not prepare photo upload',
    );
  });
});

describe('uploadPhotosDirect', () => {
  it('keeps its original shape: stored paths plus a failure count', async () => {
    mockStorage({ 'a.jpg': [ok], 'b.jpg': [status(403)] });
    expect(await uploadPhotosDirect([photo('a.jpg'), photo('b.jpg')], undefined, FAST)).toEqual({
      paths: ['submissions/a.jpg'],
      failed: 1,
    });
  });

  it('returns nothing to do for no files, without a request', async () => {
    const { calls } = mockStorage({});
    expect(await uploadPhotosDirect([])).toEqual({ paths: [], failed: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe('uploadPhotosWithDeadline', () => {
  // Per-attempt limits far longer than the deadline, so only the deadline ends a hang.
  const SLOW = { timeoutMs: 10_000, backoffMs: 1 };
  const page = (visible = true) => {
    const state = { visible };
    const clock: PageClock = { now: () => Date.now(), visible: () => state.visible };
    return { state, clock };
  };

  it('lets the lead go with the photos that made it once the deadline passes', async () => {
    const { putsTo } = mockStorage({ 'a.jpg': [ok], 'b.jpg': [hang] });
    const started = Date.now();
    const out = await uploadPhotosWithDeadline([photo('a.jpg'), photo('b.jpg')], undefined, {
      ...SLOW,
      deadlineMs: 50,
      clock: page().clock,
    });
    expect(out).toEqual({ results: ['submissions/a.jpg', null], timedOut: true });
    expect(putsTo('b.jpg')).toBe(1); // aborted, not retried
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('calls off photos that had not started', async () => {
    const { putsTo } = mockStorage({ 'a.jpg': [hang], 'b.jpg': [hang], 'c.jpg': [hang], 'd.jpg': [ok] });
    const out = await uploadPhotosWithDeadline(
      ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'].map(photo),
      undefined,
      { ...SLOW, deadlineMs: 50, clock: page().clock },
    );
    expect(out.results).toEqual([null, null, null, null]);
    expect(putsTo('d.jpg')).toBe(0);
  });

  it('does not spend the deadline while the phone is locked', async () => {
    mockStorage({ 'a.jpg': [hang] });
    const { state, clock } = page(false);
    let settled = false;
    const pending = uploadPhotosWithDeadline([photo('a.jpg')], undefined, { ...SLOW, deadlineMs: 40, clock }).then(
      (out) => {
        settled = true;
        return out;
      },
    );
    await new Promise((r) => setTimeout(r, 150));
    expect(settled).toBe(false);
    state.visible = true;
    expect(await pending).toEqual({ results: [null], timedOut: true });
  });

  it('reports a timeout when the upload URLs never came', async () => {
    mockStorage({}, [hang]);
    const out = await uploadPhotosWithDeadline([photo('a.jpg'), photo('b.jpg')], undefined, {
      ...SLOW,
      deadlineMs: 40,
      clock: page().clock,
    });
    expect(out).toEqual({ results: [null, null], timedOut: true });
  });

  it('reports no timeout when every photo finishes in time', async () => {
    mockStorage({ 'a.jpg': [ok], 'b.jpg': [status(500), ok] });
    const out = await uploadPhotosWithDeadline([photo('a.jpg'), photo('b.jpg')], undefined, {
      ...FAST,
      deadlineMs: 5_000,
      clock: page().clock,
    });
    expect(out).toEqual({ results: ['submissions/a.jpg', 'submissions/b.jpg'], timedOut: false });
  });
});
