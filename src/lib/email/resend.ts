import { Resend } from 'resend';
import { isOwnAddress } from './addresses';
import { logger } from '@/lib/logger';

/**
 * The Resend account — and so this API key — is shared with other
 * businesses, and the key can send as any domain on it. Mayells only ever
 * sends as Mayells: every request the SDK makes passes through `post`, and
 * the guard there refuses any outgoing message whose From is not on a
 * Mayells domain (or that has no From, which would fall back to a template's
 * sender), before anything reaches Resend.
 */
export function isMayellsSender(from: unknown): boolean {
  return typeof from === 'string' && isOwnAddress(from);
}

/** Endpoints that put a message on the wire: send, batch, broadcast, forward. */
const SENDING_PATH = /^\/(emails(\/batch)?|broadcasts|emails\/receiving\/[^/]+\/forward)\/?$/;

/** The From of every message in a request body, or [] when it carries none. */
function sendersOf(path: string, entity: unknown): unknown[] {
  const items = Array.isArray(entity) ? entity : [entity];
  const isSend = SENDING_PATH.test(path);
  return items.flatMap((item) => {
    const hasFrom = !!item && typeof item === 'object' && 'from' in item;
    if (!hasFrom) return isSend ? [undefined] : [];
    return [(item as { from: unknown }).from];
  });
}

let resendClient: Resend | null = null;

export function getResend(): Resend {
  if (resendClient) return resendClient;
  const client = new Resend(process.env.RESEND_API_KEY!);

  const post = client.post.bind(client);
  client.post = (async (path: string, entity?: unknown, options?: Parameters<typeof post>[2]) => {
    const refused = sendersOf(path, entity).filter((from) => !isMayellsSender(from));
    if (refused.length > 0) {
      const message = `Refused to send as "${String(refused[0] ?? '(no From)')}": Mayells only sends from its own domains.`;
      logger.error(message, { path });
      // The SDK's own error shape — it returns errors rather than throwing.
      return {
        data: null,
        error: { name: 'invalid_from_address', message, statusCode: 422 },
        headers: null,
      };
    }
    return post(path, entity, options);
  }) as typeof client.post;

  resendClient = client;
  return client;
}
