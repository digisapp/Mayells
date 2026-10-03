import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { rateLimit } from '@/lib/rate-limit';
import { SYSTEM_CATEGORY, TEST_SUMMARY, sendAdminEmail } from '@/lib/email/admin-inbox';
import { getInboundAddress, isValidEmail } from '@/lib/email/addresses';
import { BUSINESS } from '@/lib/config';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/emails/test — send a round-trip test to the signed-in admin.
 *
 * Proves the whole loop, not just sending: the mail goes out through the
 * normal reply path (the inbox From, per-thread Reply-To), so replying to it
 * from the admin's own mailbox must land back in /admin/emails under the
 * same thread. If the reply never shows up, receiving (DNS / webhook) is the
 * part that's broken — see /api/admin/emails/status.
 */
export async function POST() {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const to = (admin.email || '').trim().toLowerCase();
    if (!isValidEmail(to)) {
      return NextResponse.json({ error: 'Your admin account has no email address to send to' }, { status: 400 });
    }

    const { success } = await rateLimit(`admin:inbox-test:${admin.id}`, { maxRequests: 5, windowSeconds: 600, failClosed: true });
    if (!success) {
      return NextResponse.json({ error: 'Too many test emails — wait a few minutes and try again.' }, { status: 429 });
    }

    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const subject = `Mayells inbox test · ${stamp}`;
    const text = [
      'This is a test from the Mayells admin inbox.',
      '',
      'Reply to this email. Your reply should appear in /admin/emails within a minute, in the same thread as this message.',
      '',
      `Replies are routed through ${getInboundAddress()} (per-thread plus address). If nothing arrives, receiving is not set up yet — the Inbox page shows what is missing.`,
      '',
      `— ${BUSINESS.name}`,
    ].join('\n');

    const result = await sendAdminEmail({
      to,
      subject,
      text,
      rowExtras: { aiCategory: SYSTEM_CATEGORY, aiSummary: TEST_SUMMARY },
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    logger.info('Inbox test email sent', { adminId: admin.id, to, emailId: result.email.id });
    return NextResponse.json({ success: true, to, id: result.email.id, threadId: result.threadId });
  } catch (error) {
    logger.error('Inbox test send error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
