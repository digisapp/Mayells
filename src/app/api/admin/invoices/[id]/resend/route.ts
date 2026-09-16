import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { invoices, users, lots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendInvoiceNotification } from '@/lib/email/notifications';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/admin/invoices/[id]/resend — re-send the buyer's invoice email (with pay link). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const [row] = await db
      .select({
        id: invoices.id,
        status: invoices.status,
        invoiceNumber: invoices.invoiceNumber,
        totalAmount: invoices.totalAmount,
        dueDate: invoices.dueDate,
        accessToken: invoices.accessToken,
        buyerEmail: users.email,
        lotTitle: lots.title,
      })
      .from(invoices)
      .innerJoin(users, eq(users.id, invoices.buyerId))
      .innerJoin(lots, eq(lots.id, invoices.lotId))
      .where(eq(invoices.id, id))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (row.status !== 'pending' && row.status !== 'overdue') {
      return NextResponse.json({ error: `Cannot resend a ${row.status} invoice` }, { status: 409 });
    }
    if (!row.buyerEmail || isSentinelEmail(row.buyerEmail)) {
      return NextResponse.json({ error: 'The buyer has no reachable email address' }, { status: 409 });
    }

    try {
      await sendInvoiceNotification({
        email: row.buyerEmail,
        lotTitle: row.lotTitle,
        invoiceNumber: row.invoiceNumber,
        totalAmount: row.totalAmount,
        dueDate: row.dueDate,
        accessToken: row.accessToken,
      });
    } catch (err) {
      logger.error('Invoice resend failed', err, { invoiceId: id });
      return NextResponse.json({ error: 'Email provider rejected the send — try again shortly' }, { status: 502 });
    }

    const emailSentAt = new Date();
    await db.update(invoices).set({ emailSentAt, updatedAt: emailSentAt }).where(eq(invoices.id, id));

    logger.info('Invoice email resent', { invoiceId: id, by: admin.id });
    return NextResponse.json({ data: { id, emailSentAt } });
  } catch (error) {
    logger.error('Admin invoice resend error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
