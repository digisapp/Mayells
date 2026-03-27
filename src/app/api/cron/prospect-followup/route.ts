import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sellerProspects, uploadLinks } from '@/db/schema';
import { eq, and, lte } from 'drizzle-orm';
import { sendProspectFollowUpEmail } from '@/lib/email/notifications';
import { logger } from '@/lib/logger';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  // Verify cron secret — always required
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
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

        // Append follow-up note
        const followUpNote = `[${now.toISOString()}] Automated follow-up email sent (status: new, no contact after 48h)`;
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

    // 2. Prospects with status 'upload_sent' where the upload link was sent more than 72 hours ago
    //    and no items have been uploaded
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

        // Append follow-up note
        const followUpNote = `[${now.toISOString()}] Automated follow-up email sent (status: upload_sent, no uploads after 72h)`;
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
