/**
 * Admin-inbox addressing helpers. Pure (no DB, no network) so they are unit
 * testable and shared by the Resend webhook, the manual send path, the AI
 * auto-reply and the readiness check.
 *
 * Which domains are ours
 * ----------------------
 * The domains this platform owns mail for: their MX points at Resend inbound
 * and we send as them. Any subdomain of them counts too, so receiving can be
 * moved to e.g. inbound.mayells.com later without a code change. Nothing
 * else ever counts — not even an env override — so Mayells only takes in
 * mail addressed to Mayells and only sends as Mayells (resend.ts enforces
 * the sending half on every call).
 *
 * The Resend account is shared with other businesses and its webhooks are
 * account-wide — every domain's `email.received` reaches every endpoint — so
 * `ownRecipient` is what tells Mayells mail apart from everyone else's.
 *
 * Threading model
 * ---------------
 * Every outbound admin email sets Reply-To to a per-thread plus-address,
 * `info+<threadId>@mayells.com`. Resend delivers mail for ANY local part on a
 * receiving domain, so a reply comes back already tagged with the thread it
 * belongs to. That is exact, independent of whether the recipient's mail
 * client preserves In-Reply-To, and needs no subject matching. The webhook
 * falls back to In-Reply-To and then subject matching for mail that was not
 * answered through the inbox.
 */

import { BUSINESS } from '@/lib/config';

export const OWN_EMAIL_DOMAINS = ['mayells.com', 'mayellauctions.com'] as const;
export const PRIMARY_DOMAIN = OWN_EMAIL_DOMAINS[0];

/** The mailbox customers write to and that replies route back through. */
export const DEFAULT_INBOUND_ADDRESS: string = BUSINESS.email;
/** Who admin replies go out as. On a verified sending domain. */
export const DEFAULT_ADMIN_FROM_ADDRESS: string = BUSINESS.email;
export const ADMIN_FROM_NAME = 'Mayells';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function cleanEnv(name: string): string {
  return (process.env[name] || '').trim().replace(/^['"]|['"]$/g, '');
}

/** "Jane Doe <jane@example.com>" → "jane@example.com"; a bare address passes through. */
export function bareAddress(raw: string): string {
  const match = raw.match(/<([^<>]+)>\s*$/);
  return (match ? match[1] : raw).trim();
}

export function isValidEmail(value: string | null | undefined): value is string {
  return !!value && value.length <= 254 && EMAIL_RE.test(value);
}

/**
 * The bare receiving mailbox (`ADMIN_EMAIL_ADDRESS` override, default info@).
 * An override off our domains is ignored: it would make another business's
 * mail look like ours.
 */
export function getInboundAddress(): string {
  const raw = cleanEnv('ADMIN_EMAIL_ADDRESS').toLowerCase();
  return isValidEmail(raw) && isOwnAddress(raw) ? raw : DEFAULT_INBOUND_ADDRESS;
}

/** Domain part of the inbound address — the domain that must receive in Resend. */
export function getInboundDomain(inboundAddress: string = getInboundAddress()): string {
  return inboundAddress.slice(inboundAddress.lastIndexOf('@') + 1).toLowerCase();
}

/** Bare sender address for admin replies (`ADMIN_EMAIL_FROM` override). */
export function getAdminFromAddress(): string {
  const { email } = parseEmailAddress(cleanEnv('ADMIN_EMAIL_FROM'));
  return isValidEmail(email) && isOwnAddress(email) ? email : DEFAULT_ADMIN_FROM_ADDRESS;
}

/** `Mayells <info@mayells.com>` — the From header on admin replies. */
export function getAdminFrom(): string {
  const { name } = parseEmailAddress(cleanEnv('ADMIN_EMAIL_FROM'));
  return `${name || ADMIN_FROM_NAME} <${getAdminFromAddress()}>`;
}

function domainOf(address: string): string | null {
  const at = address.lastIndexOf('@');
  return at < 0 ? null : address.slice(at + 1);
}

function isOwnDomain(domain: string): boolean {
  return OWN_EMAIL_DOMAINS.some((own) => domain === own || domain.endsWith(`.${own}`));
}

/** Is this address on mayells.com, mayellauctions.com or a subdomain of either? */
export function isOwnAddress(raw: string): boolean {
  const domain = domainOf(parseEmailAddress(raw).email);
  return !!domain && isOwnDomain(domain);
}

/** `info@x` + thread `t` → `info+t@x`. Falls back to the bare address for a non-UUID. */
export function threadReplyAddress(threadId: string, inboundAddress: string = getInboundAddress()): string {
  const at = inboundAddress.lastIndexOf('@');
  if (at < 0 || !UUID_RE.test(threadId)) return inboundAddress;
  return `${inboundAddress.slice(0, at)}+${threadId.toLowerCase()}@${inboundAddress.slice(at + 1)}`;
}

/** Bare address (+ display name) from `"Name" <a@b>`, `Name <a@b>`, `<a@b>` or `a@b`. */
export function parseEmailAddress(raw: string | null | undefined): { name: string | null; email: string } {
  const s = decodeEncodedWords((raw || '').trim());
  const m = s.match(/^"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: s.replace(/^<|>$/g, '').trim().toLowerCase() };
}

/**
 * RFC 2047 encoded words (`=?UTF-8?B?...?=`), how non-ASCII names like
 * "José" arrive in raw headers. Adjacent encoded words join without the
 * whitespace between them. Anything undecodable is left as-is.
 */
export function decodeEncodedWords(value: string): string {
  if (!value.includes('=?')) return value;
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset: string, enc: string, text: string) => {
      try {
        const bytes = enc.toUpperCase() === 'B'
          ? Buffer.from(text, 'base64')
          : Buffer.from(
              text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))),
              'latin1',
            );
        return new TextDecoder(charset).decode(bytes);
      } catch {
        return whole;
      }
    });
}

/**
 * Display name of an inbound sender. On a fetched Resend email `from` is
 * often the bare address; the name survives in the raw From header. Null
 * when there is none (callers fall back to the address).
 */
export function senderDisplayName(fromHeader: unknown, fallbackFrom?: string | null): string | null {
  const candidates = [typeof fromHeader === 'string' ? fromHeader : '', fallbackFrom || ''];
  for (const raw of candidates) {
    const { name } = parseEmailAddress(raw);
    const clean = (name || '').replace(/["<>\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (clean) return clean;
  }
  return null;
}

function addressList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && !!v);
  return typeof value === 'string' && value ? [value] : [];
}

/** Every recipient address an `email.received` payload names, envelope first. */
export function recipientsOf(data: Record<string, unknown>): string[] {
  return [...addressList(data.received_for), ...addressList(data.to), ...addressList(data.cc), ...addressList(data.bcc)];
}

/**
 * The first of our addresses an inbound message was delivered to, or null
 * when none of its recipients is ours (mail for another business on the same
 * Resend account). `received_for` (the envelope recipients) is checked
 * first: it is the only list that shows a Bcc. Plus tags are stripped so the
 * stored to_email is the mailbox, not `info+<uuid>@`.
 */
export function ownRecipient(data: Record<string, unknown>): string | null {
  for (const field of ['received_for', 'to', 'cc', 'bcc']) {
    const own = addressList(data[field]).find(isOwnAddress);
    if (own) return stripPlusTag(parseEmailAddress(own).email);
  }
  return null;
}

/** `info+<uuid>@mayells.com` → `info@mayells.com`; other plus tags are kept. */
export function stripPlusTag(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return email;
  const local = email.slice(0, at);
  const plus = local.indexOf('+');
  if (plus < 0 || !UUID_RE.test(local.slice(plus + 1))) return email;
  return `${local.slice(0, plus)}@${email.slice(at + 1)}`;
}

/**
 * Find our thread tag in any recipient address of an inbound mail (To, Cc,
 * and Resend's `received_for` for forwarded mail). Returns null when no
 * address is `<ourLocal>+<uuid>@<ourDomain>`.
 */
export function parseThreadIdFromAddresses(
  addresses: Array<string | null | undefined>,
  inboundAddress: string = getInboundAddress(),
): string | null {
  const at = inboundAddress.lastIndexOf('@');
  if (at < 0) return null;
  const ourLocal = inboundAddress.slice(0, at).toLowerCase();
  const ourDomain = inboundAddress.slice(at + 1).toLowerCase();

  for (const raw of addresses) {
    const { email } = parseEmailAddress(raw);
    const i = email.lastIndexOf('@');
    if (i < 0 || email.slice(i + 1) !== ourDomain) continue;
    const local = email.slice(0, i);
    const plus = local.indexOf('+');
    if (plus < 0 || local.slice(0, plus) !== ourLocal) continue;
    const tag = local.slice(plus + 1);
    if (UUID_RE.test(tag)) return tag.toLowerCase();
  }
  return null;
}
