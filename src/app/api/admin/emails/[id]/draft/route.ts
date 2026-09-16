import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { emails } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { rateLimit } from '@/lib/rate-limit';
import { generateAndStoreDraft } from '@/lib/ai/email-reply';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const draftSchema = z.object({
  /** Short operator steering merged into the prompt ("offer a Tuesday slot"). */
  instructions: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/admin/emails/[id]/draft — (re)generate the AI draft reply for an
 * inbound email, optionally steered by a short instruction. Stores the draft
 * on the row for the inbox's review controls; never sends anything.
 */
export async function POST(
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

    // An empty body means "regenerate as-is"; only a malformed one is rejected.
    const parsed = draftSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Each call is an LLM round trip: cap per admin, and fail closed on a
    // Redis outage so the limit can't be bypassed to run up spend.
    const { success } = await rateLimit(`admin:email-draft:${admin.id}`, {
      maxRequests: 10,
      windowSeconds: 60,
      failClosed: true,
    });
    if (!success) {
      return NextResponse.json(
        { error: 'Too many draft requests — wait a minute and try again.' },
        { status: 429 },
      );
    }

    const [email] = await db.select().from(emails).where(eq(emails.id, id)).limit(1);
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (email.direction !== 'inbound') {
      return NextResponse.json({ error: 'Drafts can only be generated for incoming emails' }, { status: 400 });
    }

    const draft = await generateAndStoreDraft(email, parsed.data.instructions || null);
    if (!draft) {
      return NextResponse.json(
        { error: 'The assistant did not produce a draft for this email (it reads as spam or an automated message). Try again with instructions.' },
        { status: 422 },
      );
    }

    return NextResponse.json({
      data: {
        aiDraftText: draft.draftText,
        aiDraftHtml: draft.draftHtml,
        aiDraftedAt: draft.draftedAt,
      },
    });
  } catch (error) {
    logger.error('Admin email draft error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
