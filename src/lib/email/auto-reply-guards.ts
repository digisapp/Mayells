import { isOwnAddress } from './addresses';

/**
 * Reasons an inbound email must never receive an automatic reply, no matter
 * how confident the classifier is. Pure, so it is unit tested. Without these,
 * an out-of-office responder (or another bot) and our auto-reply ping-pong
 * forever, and anything sent from our own domain or a mailer-daemon gets a
 * cheerful "Thanks for reaching out" back.
 */

const AUTOMATED_LOCAL_PARTS = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|notifications?|alerts?|auto-?reply|newsletter|marketing)\b/;

const AUTOMATED_SUBJECTS = [
  'auto-reply', 'auto reply', 'autoreply', 'automatic reply', 'out of office',
  'out-of-office', 'vacation', 'do not reply', 'undeliverable', 'delivery status',
  'mail delivery', 'mailer-daemon', 'postmaster',
];

export type HeaderBag = Record<string, string | string[] | null | undefined> | null | undefined;

function lowercaseHeaders(headers: HeaderBag): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (v == null) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(' ') : String(v);
  }
  return out;
}

export function autoReplySuppressionReason(args: {
  from: string;
  subject?: string | null;
  headers?: HeaderBag;
}): string | null {
  const from = (args.from || '').toLowerCase().trim();
  if (!from || !from.includes('@')) return 'no sender address';
  const localPart = from.split('@')[0];
  if (isOwnAddress(from)) return 'sender is our own domain';
  if (AUTOMATED_LOCAL_PARTS.test(localPart)) return `sender looks automated (${localPart})`;

  const subject = (args.subject || '').toLowerCase();
  const marker = AUTOMATED_SUBJECTS.find((m) => subject.includes(m));
  if (marker) return `subject looks automated ("${marker}")`;

  const h = lowercaseHeaders(args.headers);
  const autoSubmitted = (h['auto-submitted'] || '').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return `Auto-Submitted: ${autoSubmitted}`;
  const precedence = (h['precedence'] || h['x-precedence'] || '').toLowerCase();
  if (/bulk|list|junk|auto_reply/.test(precedence)) return `Precedence: ${precedence}`;
  if (h['x-auto-response-suppress'] || h['x-autoreply'] || h['x-autorespond'] || h['list-id'] || h['list-unsubscribe']) {
    return 'automated/list mail headers present';
  }
  return null;
}
