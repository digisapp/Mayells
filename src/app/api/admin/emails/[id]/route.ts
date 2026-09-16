import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emails, users, sellerProspects, outreachContacts } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/emails/[id] — the full email row (bodies, AI draft,
 * attachment metadata) plus cross-links for the counterparty: the registered
 * user, seller prospect, and/or outreach contact whose email matches. The
 * inbox list endpoint returns slim header rows, so the UI fetches this on
 * demand when a row is expanded.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid email id' }, { status: 400 });
    }

    const [email] = await db.select().from(emails).where(eq(emails.id, id)).limit(1);
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // The counterparty is the sender of an inbound email, the recipient of an
    // outbound one.
    const counterparty = (email.direction === 'inbound' ? email.fromEmail : email.toEmail).toLowerCase();

    const [userRow, prospectRow, outreachRow] = await Promise.all([
      email.userId
        ? Promise.resolve([{ id: email.userId }])
        : db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${counterparty}`).limit(1),
      db
        .select({ id: sellerProspects.id })
        .from(sellerProspects)
        .where(sql`lower(${sellerProspects.email}) = ${counterparty}`)
        .orderBy(desc(sellerProspects.createdAt))
        .limit(1),
      db
        .select({ id: outreachContacts.id })
        .from(outreachContacts)
        .where(sql`lower(${outreachContacts.email}) = ${counterparty}`)
        .orderBy(desc(outreachContacts.createdAt))
        .limit(1),
    ]);

    return NextResponse.json({
      data: email,
      links: {
        userId: userRow[0]?.id ?? null,
        prospectId: prospectRow[0]?.id ?? null,
        outreachId: outreachRow[0]?.id ?? null,
      },
    });
  } catch (error) {
    logger.error('Admin email fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
