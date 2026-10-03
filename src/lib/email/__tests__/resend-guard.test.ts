import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const ROOT = join(__dirname, '../../../..');

/** Fresh module per test so the cached client picks up the stubbed fetch. */
async function freshResend() {
  vi.resetModules();
  process.env.RESEND_API_KEY = 're_test_key';
  return (await import('../resend')).getResend();
}

describe('isMayellsSender', () => {
  it('accepts every Mayells sending identity', async () => {
    const { isMayellsSender } = await import('../resend');
    expect(isMayellsSender('Mayells <notifications@mayells.com>')).toBe(true);
    expect(isMayellsSender('Mayells <info@mayells.com>')).toBe(true);
    expect(isMayellsSender('outreach@mayells.com')).toBe(true);
    expect(isMayellsSender('Mayell Auctions <bids@mayellauctions.com>')).toBe(true);
  });

  it('rejects the other businesses on the shared Resend account, look-alikes and junk', async () => {
    const { isMayellsSender } = await import('../resend');
    expect(isMayellsSender('EXA <noreply@examodels.com>')).toBe(false);
    expect(isMayellsSender('Staycio <hello@staycio.com>')).toBe(false);
    expect(isMayellsSender('Mayells <info@mayells.com.evil.io>')).toBe(false);
    expect(isMayellsSender('notifications@notmayells.com')).toBe(false);
    expect(isMayellsSender(undefined)).toBe(false);
    expect(isMayellsSender('')).toBe(false);
  });
});

describe('getResend send guard', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id: 'sent-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a foreign From without calling Resend', async () => {
    const resend = await freshResend();
    const result = await resend.emails.send({
      from: 'EXA <noreply@examodels.com>',
      to: 'customer@example.com',
      subject: 'Hi',
      text: 'Hi',
    });
    expect(result.data).toBeNull();
    expect(result.error?.name).toBe('invalid_from_address');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('guards the create alias and batch sends too', async () => {
    const resend = await freshResend();
    const foreign = { from: 'hello@staycio.com', to: 'a@example.com', subject: 's', text: 't' };
    expect((await resend.emails.create(foreign)).error?.name).toBe('invalid_from_address');
    expect((await resend.batch.send([
      { ...foreign, from: 'Mayells <notifications@mayells.com>' },
      foreign,
    ])).error?.name).toBe('invalid_from_address');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets a receiving forward look up the original but refuses its send', async () => {
    fetchMock.mockImplementation(async (url: string) => (String(url).includes('raw')
      ? new Response('From: a@example.com\r\nSubject: s\r\n\r\nbody', { status: 200 })
      : new Response(JSON.stringify({ id: 'abc', subject: 's', raw: { download_url: 'https://files.example/raw' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })));
    const resend = await freshResend();
    const result = await resend.emails.receiving.forward({
      emailId: 'abc',
      to: 'a@example.com',
      from: 'hello@cannesswimweek.com',
    });
    expect(result.error?.name).toBe('invalid_from_address');
    // Only the two lookups went out — never a POST.
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? 'GET') !== 'POST')).toBe(true);
  });

  it('refuses a send with no From, which would use a template default sender', async () => {
    const resend = await freshResend();
    const result = await resend.post('/emails', { to: 'a@example.com', template: { id: 'tpl_1' } });
    expect(result.error?.name).toBe('invalid_from_address');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves non-sending calls alone', async () => {
    const resend = await freshResend();
    await resend.domains.list();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes Mayells mail through to Resend unchanged', async () => {
    const resend = await freshResend();
    const result = await resend.emails.send({
      from: 'Mayells <notifications@mayells.com>',
      to: 'customer@example.com',
      subject: 'Your invoice',
      text: 'Thank you',
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 'sent-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body)).from).toBe('Mayells <notifications@mayells.com>');
  });
});

// The guard only works if nothing builds its own client around it.
describe('every send goes through the guarded client', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === 'node_modules' || name === '__tests__') return [];
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
    });
  }

  it('only src/lib/email/resend.ts constructs a Resend client in the app', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((f) => /new Resend\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual(['src/lib/email/resend.ts']);
  });

  it('no app code calls the Resend HTTP API directly', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((f) => /api\.resend\.com/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('no script sends through a client of its own', () => {
    const offenders = sourceFiles(join(ROOT, 'scripts'))
      .filter((f) => {
        const code = readFileSync(f, 'utf8');
        return /new Resend\(/.test(code) && /\.(send|create|forward)\(/.test(code);
      })
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
