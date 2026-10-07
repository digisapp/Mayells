import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { emails, users, sellerProspects, outreachContacts } from '@/db/schema';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { sendAiDraft } from '@/lib/ai/email-reply';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/emails/[id] — the full email row (bodies, AI draft,
 * attachment metadata) plus cross-links for the counterparty: the registered
 * user, seller prospect, and/or outreach contact whose email matches. The
 * inbox list endpoint returns slim header rows, so the UI fetches this on
 * demand when a row is opened.
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
        .select({
          id: sellerProspects.id,
          fullName: sellerProspects.fullName,
          phone: sellerProspects.phone,
          status: sellerProspects.status,
          itemSummary: sellerProspects.itemSummary,
          estimatedItemCount: sellerProspects.estimatedItemCount,
          city: sellerProspects.city,
          site: sellerProspects.site,
        })
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
      // The seller prospect behind the conversation, for the lead card at
      // the top of the thread: who they are, how to call them, where they
      // are in the funnel.
      prospect: prospectRow[0] ?? null,
    });
  } catch (error) {
    logger.error('Admin email fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const patchSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  isSpam: z.boolean().optional(),
  archived: z.boolean().optional(),
  /** Send the stored AI draft as the reply, as is. */
  useAiDraft: z.literal(true).optional(),
}).refine((d) => [d.isRead, d.isStarred, d.isSpam, d.archived, d.useAiDraft].some((v) => v !== undefined), {
  message: 'Nothing to update',
});

/**
 * PATCH /api/admin/emails/[id] — read / star / spam / archive flags on one
 * email, or `{ useAiDraft: true }` to send its AI draft as the reply.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid email id' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { isRead, isStarred, isSpam, archived, useAiDraft } = parsed.data;

    const [email] = await db.select().from(emails).where(eq(emails.id, id)).limit(1);
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (useAiDraft) {
      const result = await sendAiDraft(email);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      logger.info('Admin sent AI draft', { adminId: admin.id, emailId: id, outboundId: result.outboundId });
      return NextResponse.json({ success: true, sent: true, outboundId: result.outboundId });
    }

    const now = new Date();
    const updates: Record<string, unknown> = {};
    if (isStarred !== undefined) updates.isStarred = isStarred;
    if (archived !== undefined) updates.archivedAt = archived ? now : null;
    if (isSpam !== undefined && email.direction === 'inbound') updates.isSpam = isSpam;
    if (isRead === true) {
      updates.readAt = now;
      if (email.status === 'received') updates.status = 'read';
    } else if (isRead === false && email.direction === 'inbound') {
      updates.readAt = null;
      if (email.status === 'read') updates.status = 'received';
    }
    if (Object.keys(updates).length > 0) {
      await db.update(emails).set(updates).where(eq(emails.id, id));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Admin email patch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/emails/[id] — one email. Replies that pointed at it are
 * re-parented the same way the bulk route does.
 */
export async function DELETE(
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

    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: emails.id, inReplyToId: emails.inReplyToId })
        .from(emails)
        .where(eq(emails.id, id))
        .limit(1);
      if (!row) return;

      // A root being deleted: the oldest survivor becomes the new root.
      const [survivor] = await tx
        .select({ id: emails.id })
        .from(emails)
        .where(and(eq(emails.threadId, id), sql`${emails.id} <> ${id}`))
        .orderBy(emails.createdAt)
        .limit(1);
      if (survivor) {
        await tx.update(emails).set({ threadId: survivor.id }).where(and(eq(emails.threadId, id), sql`${emails.id} <> ${id}`));
        await tx.update(emails).set({ inReplyToId: null }).where(eq(emails.id, survivor.id));
      }
      await tx.update(emails).set({ inReplyToId: row.inReplyToId ?? null }).where(eq(emails.inReplyToId, id));
      await tx.update(emails).set({ threadId: null }).where(inArray(emails.threadId, [id]));
      await tx.delete(emails).where(eq(emails.id, id));
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Admin email delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
