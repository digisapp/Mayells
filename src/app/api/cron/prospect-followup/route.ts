import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/db';
import { sellerProspects, uploadLinks } from '@/db/schema';
import { eq, and, lte, or, isNull, notLike } from 'drizzle-orm';
import { sendProspectFollowUpEmail } from '@/lib/email/notifications';
import { logger } from '@/lib/logger';

const CRON_SECRET = process.env.CRON_SECRET;

// Marker appended to notes when an upload follow-up is sent — used to exclude
// already-followed-up prospects from later runs (status stays 'upload_sent').
const UPLOAD_FOLLOWUP_MARKER = 'Automated follow-up email sent (status: upload_sent';

function isAuthorized(request: NextRequest): boolean {
  // Verify cron secret — always required
  if (!CRON_SECRET) return false;
  const authHeader = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
  const provided = Buffer.from(authHeader);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function handler(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const results = {
    followUpsSent: 0,
    errors: [] as string[],
  };

  try {
    // 1. Prospects with status 'new' created more than 48 hours ago (never contacted)
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const newProspects = await db
      .select()
      .from(sellerProspects)
      .where(
        and(
          eq(sellerProspects.status, 'new'),
          lte(sellerProspects.createdAt, fortyEightHoursAgo),
        ),
      );

    for (const prospect of newProspects) {
      if (!prospect.email) continue;

      try {
        await sendProspectFollowUpEmail({
          prospectEmail: prospect.email,
          prospectName: prospect.fullName,
        });

        // Advance status so this prospect isn't re-emailed every run,
        // and append a follow-up note
        const followUpNote = `[${now.toISOString()}] Automated follow-up email sent (status: new, no contact after 48h)`;
        await db
          .update(sellerProspects)
          .set({
            status: 'contacted',
            notes: prospect.notes
              ? `${prospect.notes}\n${followUpNote}`
              : followUpNote,
            updatedAt: now,
          })
          .where(eq(sellerProspects.id, prospect.id));

        results.followUpsSent++;
      } catch (err) {
        results.errors.push(`Failed to follow up with prospect ${prospect.id}: ${err}`);
      }
    }

    // 2. Prospects with status 'upload_sent' where the upload link was sent more than 72 hours ago
    //    and no items have been uploaded (and we haven't already sent this follow-up)
    const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

    const uploadSentProspects = await db
      .select({
        prospect: sellerProspects,
        linkToken: uploadLinks.token,
        linkCreatedAt: uploadLinks.createdAt,
        linkItemCount: uploadLinks.itemCount,
      })
      .from(sellerProspects)
      .innerJoin(uploadLinks, eq(uploadLinks.prospectId, sellerProspects.id))
      .where(
        and(
          eq(sellerProspects.status, 'upload_sent'),
          lte(uploadLinks.createdAt, seventyTwoHoursAgo),
          eq(uploadLinks.itemCount, 0),
          or(
            isNull(sellerProspects.notes),
            notLike(sellerProspects.notes, `%${UPLOAD_FOLLOWUP_MARKER}%`),
          ),
        ),
      );

    // Deduplicate by prospect ID (a prospect may have multiple upload links)
    const seen = new Set<string>();

    for (const row of uploadSentProspects) {
      const prospect = row.prospect;
      if (!prospect.email || seen.has(prospect.id)) continue;
      seen.add(prospect.id);

      try {
        const uploadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload/${row.linkToken}`;

        await sendProspectFollowUpEmail({
          prospectEmail: prospect.email,
          prospectName: prospect.fullName,
          uploadUrl,
        });

        // Append follow-up note — the marker excludes this prospect from future runs
        const followUpNote = `[${now.toISOString()}] ${UPLOAD_FOLLOWUP_MARKER}, no uploads after 72h)`;
        await db
          .update(sellerProspects)
          .set({
            notes: prospect.notes
              ? `${prospect.notes}\n${followUpNote}`
              : followUpNote,
            updatedAt: now,
          })
          .where(eq(sellerProspects.id, prospect.id));

        results.followUpsSent++;
      } catch (err) {
        results.errors.push(`Failed to follow up with prospect ${prospect.id}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (error) {
    logger.error('Cron prospect-followup error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Vercel cron invokes with GET; keep POST for manual/legacy triggers
export { handler as GET, handler as POST };
