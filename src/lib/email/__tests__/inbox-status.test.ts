import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resendMock = {
  domains: { list: vi.fn(), get: vi.fn() },
  webhooks: { list: vi.fn() },
};
vi.mock('../resend', () => ({ getResend: () => resendMock }));

import { CANONICAL_WEBHOOK_URL, getInboxStatus, resetInboxStatusCache, zoneHost } from '../inbox-status';

const DOMAIN = {
  id: 'dom_1', name: 'mayells.com', status: 'verified', region: 'us-east-1', created_at: '',
  capabilities: { sending: 'enabled', receiving: 'enabled' },
};
const RECORDS = [
  { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=abc', status: 'verified', ttl: 'Auto' },
  { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.us-east-1.amazonses.com', status: 'verified', ttl: 'Auto', priority: 10 },
  { record: 'SPF', name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', status: 'verified', ttl: 'Auto' },
];
const HOOK = { id: 'wh_1', endpoint: CANONICAL_WEBHOOK_URL, status: 'enabled', created_at: '', events: ['email.received', 'email.delivered', 'email.bounced', 'email.failed', 'email.suppressed'] };
const OTHER_HOOK = { id: 'wh_2', endpoint: 'https://www.digis.cc/api/resend/inbound', status: 'enabled', created_at: '', events: ['email.received'] };

function arrange(opts: { domain?: Partial<typeof DOMAIN> | null; records?: unknown[]; hooks?: unknown[] } = {}) {
  const domain = opts.domain === null ? null : { ...DOMAIN, ...opts.domain };
  resendMock.domains.list.mockResolvedValue({ data: { data: domain ? [domain] : [] }, error: null });
  resendMock.domains.get.mockResolvedValue({ data: domain ? { ...domain, records: opts.records ?? RECORDS } : null, error: null });
  resendMock.webhooks.list.mockResolvedValue({ data: { data: opts.hooks ?? [OTHER_HOOK, HOOK] }, error: null });
}

beforeEach(() => {
  resetInboxStatusCache();
  process.env.RESEND_API_KEY = 're_test';
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
  process.env.XAI_API_KEY = 'xai_test';
  delete process.env.AI_PROVIDER;
  delete process.env.ADMIN_EMAIL_ADDRESS;
  delete process.env.ADMIN_EMAIL_FROM;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_WEBHOOK_SECRET;
  delete process.env.XAI_API_KEY;
});

describe('zoneHost', () => {
  it('maps Resend record names to what the registrar wants', () => {
    expect(zoneHost('mayells.com', 'mayells.com')).toBe('@');
    expect(zoneHost('inbound.mayells.com', 'inbound.mayells.com')).toBe('inbound');
    expect(zoneHost('resend._domainkey', 'mayells.com')).toBe('resend._domainkey');
  });
});

describe('getInboxStatus', () => {
  it('is ready when the domain receives, the webhook is canonical and the secret is set', async () => {
    arrange();
    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(true);
    expect(s.problems).toEqual([]);
    // Only the shared-account note: the other project's webhook sees our mail.
    expect(s.warnings).toEqual([expect.stringMatching(/shared.*reaches 1 other endpoint/)]);
    expect(s.sharedAccount).toEqual({ otherDomains: 0, otherInboundWebhooks: 1 });
    expect(s.inboundAddress).toBe('info@mayells.com');
    expect(s.from).toBe('Mayells <info@mayells.com>');
    expect(s.webhook.endpoint).toBe(CANONICAL_WEBHOOK_URL);
    // The receiving MX is shown even though Resend did not list it.
    const mx = s.domain.records.find((r) => r.record === 'Receiving');
    expect(mx).toMatchObject({ type: 'MX', host: '@', value: 'inbound-smtp.us-east-1.amazonaws.com', priority: 10, status: 'verified' });
  });

  it('has nothing to note when Mayells has the Resend account to itself', async () => {
    arrange({ hooks: [HOOK] });
    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(true);
    expect(s.warnings).toEqual([]);
  });

  it('counts the other businesses on the account, but not webhooks that ignore inbound mail', async () => {
    arrange({ hooks: [HOOK, OTHER_HOOK, { ...OTHER_HOOK, id: 'wh_3', events: ['email.delivered'] }] });
    resendMock.domains.list.mockResolvedValue({
      data: { data: [DOMAIN, { ...DOMAIN, id: 'dom_2', name: 'examodels.com' }, { ...DOMAIN, id: 'dom_3', name: 'mayellauctions.com' }] },
      error: null,
    });
    const s = await getInboxStatus({ fresh: true });
    expect(s.sharedAccount).toEqual({ otherDomains: 1, otherInboundWebhooks: 1 });
  });

  it('stops at the API key when there is none', async () => {
    delete process.env.RESEND_API_KEY;
    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(false);
    expect(s.problems[0]).toMatch(/RESEND_API_KEY/);
    expect(resendMock.domains.list).not.toHaveBeenCalled();
  });

  it('names the missing MX and receiving switch', async () => {
    arrange({ domain: { capabilities: { sending: 'enabled', receiving: 'disabled' } } });
    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(false);
    expect(s.problems).toHaveLength(1);
    expect(s.problems[0]).toMatch(/Receiving is "disabled" on mayells\.com/);
    expect(s.domain.records.find((r) => r.record === 'Receiving')?.status).toBe('missing');
  });

  it('ignores other projects’ webhooks on the shared account and flags a wrong host', async () => {
    arrange({ hooks: [OTHER_HOOK, { ...HOOK, endpoint: 'https://www.mayells.com/api/email/inbound' }] });
    const s = await getInboxStatus({ fresh: true });
    expect(s.webhook.found).toBe(true);
    expect(s.webhook.canonical).toBe(false);
    expect(s.ready).toBe(false);
    expect(s.problems.join('\n')).toMatch(/must be exactly https:\/\/mayells\.com\/api\/email\/inbound/);
  });

  it('reports a missing webhook, a missing secret and a missing AI key', async () => {
    arrange({ hooks: [OTHER_HOOK] });
    delete process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.XAI_API_KEY;
    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(false);
    expect(s.problems.join('\n')).toMatch(/No Resend webhook points at/);
    expect(s.problems.join('\n')).toMatch(/RESEND_WEBHOOK_SECRET/);
    expect(s.warnings.join('\n')).toMatch(/No API key for the AI provider "xai"/);
  });

  it('warns (without blocking) when delivery events are not subscribed', async () => {
    arrange({ hooks: [{ ...HOOK, events: ['email.received'] }] });
    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(true);
    expect(s.warnings[0]).toMatch(/email\.delivered, email\.bounced, email\.failed, email\.suppressed/);
  });

  it('checks the From domain separately when replies leave from another domain', async () => {
    process.env.ADMIN_EMAIL_ADDRESS = 'inbox@inbound.mayells.com';
    const inbound = { ...DOMAIN, id: 'dom_2', name: 'inbound.mayells.com' };
    resendMock.domains.list.mockResolvedValue({ data: { data: [DOMAIN, inbound] }, error: null });
    resendMock.domains.get.mockImplementation(async (id: string) => ({
      data: { ...(id === 'dom_2' ? inbound : DOMAIN), records: RECORDS }, error: null,
    }));
    resendMock.webhooks.list.mockResolvedValue({ data: { data: [HOOK] }, error: null });
    const s = await getInboxStatus({ fresh: true });
    expect(s.inboundDomain).toBe('inbound.mayells.com');
    expect(s.fromDomain?.name).toBe('mayells.com');
    expect(s.ready).toBe(true);
    expect(s.domain.records.find((r) => r.record === 'Receiving')?.host).toBe('inbound');
  });

  it('surfaces a Resend API failure instead of pretending', async () => {
    resendMock.domains.list.mockResolvedValue({ data: null, error: { message: 'unauthorized' } });
    resendMock.webhooks.list.mockResolvedValue({ data: { data: [] }, error: null });
    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(false);
    expect(s.error).toMatch(/unauthorized/);
  });

  it('caches for a short while unless asked for a fresh check', async () => {
    arrange();
    await getInboxStatus({ fresh: true });
    await getInboxStatus();
    expect(resendMock.domains.list).toHaveBeenCalledTimes(1);
    await getInboxStatus({ fresh: true });
    expect(resendMock.domains.list).toHaveBeenCalledTimes(2);
  });
});
