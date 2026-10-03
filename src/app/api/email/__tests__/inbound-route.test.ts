import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Resend inbound webhook: signature, the shared-account recipient filter,
 * the body fetch, plus-address threading and the delivery-status branch.
 * Everything below the route is mocked; the DB is a recording stub.
 */

const h = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const inserted: Record<string, unknown>[] = [];
  // A chainable, awaitable query stub. `selectResults` are handed out in
  // call order; inserts record their values and return a fixed id.
  function chain(result: () => unknown) {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['from', 'where', 'orderBy', 'limit', 'set', 'leftJoin']) c[m] = self;
    c.values = (v: Record<string, unknown>) => { inserted.push(v); return c; };
    c.returning = () => Promise.resolve(result());
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return c;
  }
  return {
    verify: vi.fn(),
    afterCalls: [] as Array<() => unknown>,
    receivingGet: vi.fn(),
    claimWebhookEvent: vi.fn(),
    finalizeWebhookLog: vi.fn(),
    processInboundEmail: vi.fn(),
    forwardInboundEmail: vi.fn(),
    handleResendEvent: vi.fn(),
    selectResults,
    inserted,
    db: {
      select: () => chain(() => selectResults.shift() ?? []),
      insert: () => chain(() => [{ id: 'saved-1' }]),
      update: () => chain(() => []),
    },
  };
});
const { verify, afterCalls, receivingGet, claimWebhookEvent, finalizeWebhookLog, processInboundEmail, forwardInboundEmail, handleResendEvent, selectResults, inserted } = h;

vi.mock('svix', () => ({ Webhook: class { verify = h.verify; } }));
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => { h.afterCalls.push(fn); } };
});
vi.mock('@/lib/email/resend', () => ({ getResend: () => ({ emails: { receiving: { get: h.receivingGet } } }) }));
vi.mock('@/lib/webhooks/log', () => ({ claimWebhookEvent: h.claimWebhookEvent, finalizeWebhookLog: h.finalizeWebhookLog }));
vi.mock('@/lib/ai/email-reply', () => ({ processInboundEmail: h.processInboundEmail }));
vi.mock('@/lib/email/notifications', () => ({
  forwardInboundEmail: h.forwardInboundEmail,
  listForwardableAttachments: vi.fn(async () => ({ attachments: [], skipped: 0 })),
}));
vi.mock('@/lib/email/resend-events', () => ({ handleResendEvent: h.handleResendEvent }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/db', () => ({ db: h.db }));
vi.mock('@/db/schema', () => ({
  emails: { id: 'id', threadId: 'thread_id', messageId: 'message_id', resendId: 'resend_id', createdAt: 'created_at', toEmail: 'to_email', fromEmail: 'from_email', subject: 'subject' },
  users: { id: 'id', email: 'email' },
}));

import { POST } from '../inbound/route';

const THREAD = '0b4a1f7e-3c2d-4e5f-8a9b-0c1d2e3f4a5b';

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://mayells.com/api/email/inbound', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'svix-id': 'msg_1', 'svix-timestamp': '1', 'svix-signature': 'v1,x', ...headers },
    body: JSON.stringify(body),
  });
}

function received(data: Record<string, unknown>) {
  return { type: 'email.received', data: { email_id: 'rcv_1', from: 'Jane <jane@gmail.com>', to: ['info@mayells.com'], subject: 'Rolex', ...data } };
}

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
  verify.mockImplementation(() => undefined);
  claimWebhookEvent.mockResolvedValue({ claimed: true, id: 'log-1' });
  finalizeWebhookLog.mockResolvedValue(undefined);
  receivingGet.mockResolvedValue({
    data: {
      id: 'rcv_1', from: 'jane@gmail.com', to: ['info@mayells.com'], cc: null, bcc: null, received_for: ['info@mayells.com'],
      subject: 'Rolex', html: '<p>Hi</p>', text: 'Hi', message_id: '<m1@gmail.com>',
      headers: { from: '=?UTF-8?B?Sm9zw6k=?= <jane@gmail.com>', 'message-id': '<m1@gmail.com>' }, attachments: [],
    },
    error: null,
  });
  selectResults.length = 0;
  inserted.length = 0;
  afterCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RESEND_WEBHOOK_SECRET;
});

describe('POST /api/email/inbound', () => {
  it('refuses to run without a webhook secret', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await POST(request(received({})) as never);
    expect(res.status).toBe(503);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects a bad signature before touching anything', async () => {
    verify.mockImplementation(() => { throw new Error('bad'); });
    const res = await POST(request(received({})) as never);
    expect(res.status).toBe(401);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(receivingGet).not.toHaveBeenCalled();
  });

  it('acknowledges and drops mail for another business on the shared account', async () => {
    const res = await POST(request(received({ to: ['hello@inbound.examodels.com'], received_for: ['hello@inbound.examodels.com'] })) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, ignored: true });
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(receivingGet).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it('stores our mail with the decoded sender name and queues the post-processing', async () => {
    selectResults.push([], [], []); // no thread match (in-reply-to, subject), no user
    const res = await POST(request(received({})) as never);
    expect(res.status).toBe(200);
    expect(receivingGet).toHaveBeenCalledWith('rcv_1');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      direction: 'inbound', fromEmail: 'jane@gmail.com', fromName: 'José', toEmail: 'info@mayells.com',
      subject: 'Rolex', bodyText: 'Hi', messageId: '<m1@gmail.com>', isSpam: false, status: 'received',
    });
    expect(afterCalls).toHaveLength(1);
    await afterCalls[0]();
    expect(forwardInboundEmail).toHaveBeenCalled();
    expect(processInboundEmail).toHaveBeenCalledWith('saved-1', { headers: expect.objectContaining({ 'message-id': '<m1@gmail.com>' }) });
    expect(finalizeWebhookLog).toHaveBeenCalledWith('log-1', expect.objectContaining({ status: 'success', relatedId: 'saved-1' }));
  });

  it('threads a reply to our plus-addressed Reply-To exactly, and files it under the plain mailbox', async () => {
    selectResults.push([{ id: 'root-1' }], []); // thread exists; no user
    const res = await POST(request(received({
      to: [`info+${THREAD}@mayells.com`],
      received_for: [`info+${THREAD}@mayells.com`],
    })) as never);
    expect(res.status).toBe(200);
    expect(inserted[0]).toMatchObject({ threadId: THREAD, inReplyToId: 'root-1', toEmail: 'info@mayells.com' });
  });

  it('fails the delivery (so Resend retries) when the body cannot be fetched', async () => {
    receivingGet.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await POST(request(received({})) as never);
    expect(res.status).toBe(500);
    expect(inserted).toHaveLength(0);
    expect(finalizeWebhookLog).toHaveBeenCalledWith('log-1', expect.objectContaining({ status: 'failed' }));
  });

  it('treats a repeat delivery as a duplicate', async () => {
    claimWebhookEvent.mockResolvedValue({ claimed: false });
    const res = await POST(request(received({})) as never);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(receivingGet).not.toHaveBeenCalled();
  });

  it('hands delivery events for our sends to the shared handler and ignores other senders', async () => {
    handleResendEvent.mockResolvedValue({ status: 'success', relatedType: 'email', relatedId: 'snd_1' });
    const ours = await POST(request({ type: 'email.delivered', data: { email_id: 'snd_1', from: 'Mayells <info@mayells.com>' } }) as never);
    expect(ours.status).toBe(200);
    expect(handleResendEvent).toHaveBeenCalledWith({ type: 'email.delivered', data: { email_id: 'snd_1', from: 'Mayells <info@mayells.com>' } });

    handleResendEvent.mockClear();
    const theirs = await POST(request({ type: 'email.delivered', data: { email_id: 'snd_2', from: 'Digis <noreply@digis.cc>' } }) as never);
    expect(await theirs.json()).toEqual({ received: true, ignored: true });
    expect(handleResendEvent).not.toHaveBeenCalled();
  });
});
