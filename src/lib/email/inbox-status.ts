/**
 * Is the admin inbox actually able to receive mail?
 *
 * "No incoming emails yet" is indistinguishable from "receiving was never
 * switched on". This asks Resend (read-only) and the environment, and spells
 * out exactly which DNS records / settings are missing, so the inbox page can
 * show it instead of an empty list.
 */
import { getResend } from './resend';
import { getAdminFrom, getAdminFromAddress, getInboundAddress, getInboundDomain, isOwnAddress, PRIMARY_DOMAIN } from './addresses';
import { HANDLED_RESEND_EVENT_TYPES } from './resend-events';
import { BUSINESS } from '@/lib/config';

/**
 * The endpoint Resend must post to. www.mayells.com 308s to the apex, and
 * Svix treats every 3xx as a failed delivery, so it has to be the apex.
 */
export const CANONICAL_WEBHOOK_URL = `${BUSINESS.url}/api/email/inbound`;

/** Without `email.received` nothing arrives; the rest keep Sent statuses honest. */
export const REQUIRED_WEBHOOK_EVENTS = ['email.received'] as const;
export const RECOMMENDED_WEBHOOK_EVENTS = HANDLED_RESEND_EVENT_TYPES;

export interface DnsRecord {
  record: 'DKIM' | 'SPF' | 'Receiving' | string;
  type: 'TXT' | 'MX' | 'CNAME' | string;
  /** Host as you type it at the registrar (relative to the mayells.com zone). */
  host: string;
  value: string;
  priority?: number;
  status: 'verified' | 'pending' | 'failed' | 'not_started' | 'missing' | string;
}

export interface DomainStatus {
  name: string;
  found: boolean;
  status: string | null;
  sending: string | null;
  receiving: string | null;
  region: string | null;
  records: DnsRecord[];
}

export interface InboxStatus {
  checkedAt: string;
  inboundAddress: string;
  inboundDomain: string;
  from: string;
  forwardTo: string;
  env: { resendApiKey: boolean; webhookSecret: boolean; aiKey: boolean; aiProvider: string };
  domain: DomainStatus;
  /** Only present when replies go out from a different domain than the inbox. */
  fromDomain: DomainStatus | null;
  webhook: {
    found: boolean;
    endpoint: string | null;
    status: string | null;
    events: string[];
    canonical: boolean;
    hasReceivedEvent: boolean;
    missingRecommendedEvents: string[];
  };
  /**
   * The Resend account is shared with other businesses. Its webhooks are
   * account-wide, so every other endpoint subscribed to email.received is
   * also sent the mail addressed to Mayells.
   */
  sharedAccount: { otherDomains: number; otherInboundWebhooks: number };
  /** Everything needed for mail to arrive in /admin/emails is in place. */
  ready: boolean;
  /** Blockers, in the order to fix them. */
  problems: string[];
  /** Non-blocking gaps (delivery statuses, AI drafts). */
  warnings: string[];
  error?: string;
}

function emptyDomain(name: string): DomainStatus {
  return { name, found: false, status: null, sending: null, receiving: null, region: null, records: [] };
}

/** Registrar host field for a record under the mayells.com zone. */
export function zoneHost(nameFromResend: string, domainName: string): string {
  // Resend returns names relative to the registered zone (`resend._domainkey`,
  // `send`), or the domain itself for the receiving MX. For a subdomain
  // inbox (inbound.mayells.com) the relative part is the subdomain.
  if (nameFromResend === domainName) {
    return domainName === PRIMARY_DOMAIN ? '@' : domainName.replace(`.${PRIMARY_DOMAIN}`, '');
  }
  return nameFromResend;
}

function aiKeyPresent(provider: string): boolean {
  if (provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  if (provider === 'openai') return !!process.env.OPENAI_API_KEY;
  return !!process.env.XAI_API_KEY;
}

type ResendClient = ReturnType<typeof getResend>;
type DomainSummary = NonNullable<Awaited<ReturnType<ResendClient['domains']['list']>>['data']>['data'][number];

async function describeDomain(resend: ResendClient, summaries: DomainSummary[], name: string): Promise<DomainStatus> {
  const out = emptyDomain(name);
  const summary = summaries.find((d) => d.name.toLowerCase() === name);
  if (!summary) return out;

  const detail = await resend.domains.get(summary.id);
  const d = detail.data;
  const region = d?.region ?? summary.region ?? 'us-east-1';
  out.found = true;
  out.status = d?.status ?? summary.status;
  out.sending = d?.capabilities?.sending ?? summary.capabilities?.sending ?? null;
  out.receiving = d?.capabilities?.receiving ?? summary.capabilities?.receiving ?? null;
  out.region = region;

  const records: DnsRecord[] = (d?.records ?? []).map((r) => ({
    record: r.record,
    type: r.type,
    host: zoneHost(r.name, name),
    value: r.value,
    priority: 'priority' in r && typeof r.priority === 'number' ? r.priority : undefined,
    status: r.status,
  }));
  // Resend only lists the receiving MX once receiving is switched on; show
  // it regardless so the admin can add every record in one go.
  if (!records.some((r) => r.record === 'Receiving')) {
    records.push({
      record: 'Receiving',
      type: 'MX',
      host: zoneHost(name, name),
      value: `inbound-smtp.${region}.amazonaws.com`,
      priority: 10,
      status: out.receiving === 'enabled' ? 'verified' : 'missing',
    });
  }
  out.records = records;
  return out;
}

let cache: { at: number; value: InboxStatus } | null = null;
const CACHE_MS = 30_000;

export async function getInboxStatus(opts: { fresh?: boolean } = {}): Promise<InboxStatus> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const inboundAddress = getInboundAddress();
  const inboundDomain = getInboundDomain(inboundAddress);
  const fromAddress = getAdminFromAddress();
  const fromDomain = fromAddress.slice(fromAddress.lastIndexOf('@') + 1);
  const aiProvider = (process.env.AI_PROVIDER || 'xai').trim();

  const status: InboxStatus = {
    checkedAt: new Date().toISOString(),
    inboundAddress,
    inboundDomain,
    from: getAdminFrom(),
    forwardTo: BUSINESS.forwardInboundTo,
    env: {
      resendApiKey: !!process.env.RESEND_API_KEY,
      webhookSecret: !!process.env.RESEND_WEBHOOK_SECRET,
      aiKey: aiKeyPresent(aiProvider),
      aiProvider,
    },
    domain: emptyDomain(inboundDomain),
    fromDomain: fromDomain === inboundDomain ? null : emptyDomain(fromDomain),
    webhook: { found: false, endpoint: null, status: null, events: [], canonical: false, hasReceivedEvent: false, missingRecommendedEvents: [] },
    sharedAccount: { otherDomains: 0, otherInboundWebhooks: 0 },
    ready: false,
    problems: [],
    warnings: [],
  };

  if (!status.env.resendApiKey) {
    status.problems.push('RESEND_API_KEY is not set, so nothing can be sent or received.');
    return status;
  }

  try {
    const resend = getResend();
    const [domainsRes, webhooksRes] = await Promise.all([resend.domains.list(), resend.webhooks.list()]);
    if (domainsRes.error) throw new Error(`Resend domains: ${domainsRes.error.message}`);
    if (webhooksRes.error) throw new Error(`Resend webhooks: ${webhooksRes.error.message}`);

    const summaries = domainsRes.data?.data ?? [];
    status.domain = await describeDomain(resend, summaries, inboundDomain);
    if (status.fromDomain) status.fromDomain = await describeDomain(resend, summaries, fromDomain);

    // The account is shared: several projects' endpoints are listed. Ours is
    // the one on our host.
    const hooks = webhooksRes.data?.data ?? [];
    const ours = hooks.find((w) => w.endpoint === CANONICAL_WEBHOOK_URL)
      ?? hooks.find((w) => /mayells\.com\/api\/email\/inbound\/?$/i.test(w.endpoint))
      ?? hooks.find((w) => w.endpoint.includes('mayells'));
    if (ours) {
      const events = (ours.events ?? []).map((e) => String(e));
      status.webhook = {
        found: true,
        endpoint: ours.endpoint,
        status: ours.status,
        events,
        canonical: ours.endpoint === CANONICAL_WEBHOOK_URL,
        hasReceivedEvent: events.includes('email.received'),
        missingRecommendedEvents: RECOMMENDED_WEBHOOK_EVENTS.filter((e) => !events.includes(e)),
      };
    }
    status.sharedAccount = {
      otherDomains: summaries.filter((d) => !isOwnAddress(`postmaster@${d.name}`)).length,
      otherInboundWebhooks: hooks.filter((h) => h !== ours && (h.events ?? []).map(String).includes('email.received')).length,
    };
  } catch (err) {
    status.error = err instanceof Error ? err.message : 'Resend check failed';
    status.problems.push(`Could not read the Resend configuration: ${status.error}`);
    return status;
  }

  // ── Problems, in fix order ──
  const p = status.problems;
  const w = status.warnings;
  if (!status.domain.found) {
    p.push(`Add ${inboundDomain} as a domain in Resend (with receiving enabled) and add its DNS records.`);
  } else {
    if (status.domain.status !== 'verified') {
      const failing = status.domain.records.filter((r) => r.record !== 'Receiving' && r.status !== 'verified');
      p.push(`${inboundDomain} is "${status.domain.status}" in Resend — ${failing.length || 'its'} DNS record(s) are missing or unverified.`);
    }
    if (status.domain.receiving !== 'enabled') {
      p.push(`Receiving is "${status.domain.receiving ?? 'off'}" on ${inboundDomain}: add the MX record below, then enable receiving for the domain in Resend.`);
    }
  }
  if (status.fromDomain) {
    if (!status.fromDomain.found || status.fromDomain.status !== 'verified' || status.fromDomain.sending !== 'enabled') {
      p.push(`Replies go out as ${fromAddress}, but ${fromDomain} is not a verified sending domain in Resend.`);
    }
  }
  if (!status.webhook.found) {
    p.push(`No Resend webhook points at ${CANONICAL_WEBHOOK_URL}. Create one for ${['email.received', ...RECOMMENDED_WEBHOOK_EVENTS].join(', ')}.`);
  } else {
    if (!status.webhook.canonical) {
      p.push(`The Resend webhook endpoint is ${status.webhook.endpoint}; it must be exactly ${CANONICAL_WEBHOOK_URL} (edit it — don't recreate — so the signing secret stays the same).`);
    }
    if (status.webhook.status !== 'enabled') p.push('The Resend webhook is disabled.');
    if (!status.webhook.hasReceivedEvent) p.push('The Resend webhook does not subscribe to email.received.');
    if (status.webhook.missingRecommendedEvents.length > 0) {
      w.push(`The webhook does not subscribe to ${status.webhook.missingRecommendedEvents.join(', ')} — Sent mail will not show delivered/bounced statuses for those events.`);
    }
  }
  if (status.sharedAccount.otherInboundWebhooks > 0) {
    const n = status.sharedAccount.otherInboundWebhooks;
    w.push(
      `This Resend account is shared, and Resend sends every incoming email to all ${n + 1} webhooks on it — so mail to Mayells also reaches ${n} other endpoint${n === 1 ? '' : 's'}. ` +
      'Mayells files only mail addressed to its own domains and only sends as them; a Resend account of its own would keep its mail off the others entirely.',
    );
  }
  if (!status.env.webhookSecret) p.push('RESEND_WEBHOOK_SECRET is not set — every webhook call is rejected.');
  if (!status.env.aiKey) {
    w.push(`No API key for the AI provider "${aiProvider}" — mail still arrives, but without summaries, categories or drafts.`);
  }

  status.ready =
    status.domain.found && status.domain.status === 'verified' && status.domain.receiving === 'enabled' &&
    (!status.fromDomain || (status.fromDomain.found && status.fromDomain.status === 'verified' && status.fromDomain.sending === 'enabled')) &&
    status.webhook.found && status.webhook.canonical && status.webhook.status === 'enabled' && status.webhook.hasReceivedEvent &&
    status.env.webhookSecret;

  cache = { at: Date.now(), value: status };
  return status;
}

/** Test seam. */
export function resetInboxStatusCache() {
  cache = null;
}
