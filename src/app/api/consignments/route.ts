import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { consignments, users, automationSettings } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { consignmentSchema } from '@/lib/validation/schemas';
import { sendConsignmentNotification } from '@/lib/email/notifications';
import { logger } from '@/lib/logger';
import { catalogLotFromImages } from '@/lib/ai/cataloging';
import { appraiseLot } from '@/lib/ai/appraisal';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const items = await db
      .select()
      .from(consignments)
      .where(eq(consignments.sellerId, user.id))
      .orderBy(desc(consignments.createdAt));

    return NextResponse.json({ data: items });
  } catch (error) {
    logger.error('Consignments error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = consignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 });
    }

    const { agreementAccepted, ...consignmentData } = parsed.data;

    // Create the consignment
    const [entry] = await db
      .insert(consignments)
      .values({
        sellerId: user.id,
        ...consignmentData,
        agreementSignedAt: agreementAccepted ? new Date() : null,
        agreementIp: agreementAccepted ? (request.headers.get('x-forwarded-for') || 'unknown') : null,
      })
      .returning();

    // Fire AI processing in background (don't block the response)
    const imageUrls = parsed.data.images || [];
    if (imageUrls.length > 0) {
      processConsignmentWithAI(entry.id, imageUrls, parsed.data.title).catch(
        (err) => logger.error('AI processing failed for consignment', { consignmentId: entry.id, error: err })
      );
    }

    // Send notification emails (fire and forget)
    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (profile) {
      sendConsignmentNotification({
        sellerName: profile.fullName || 'Unknown',
        sellerEmail: profile.email,
        title: parsed.data.title,
        description: parsed.data.description || '',
        category: parsed.data.categorySlug,
      }).catch((err) => logger.error('Failed to send consignment notification', err));
    }

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    logger.error('Create consignment error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Background AI processing for a new consignment.
 * Runs cataloging + appraisal, stores results, and optionally auto-approves.
 */
async function processConsignmentWithAI(consignmentId: string, imageUrls: string[], sellerTitle: string) {
  // Get automation settings
  const [settings] = await db.select().from(automationSettings).limit(1);
  const aiAutoCatalog = settings?.aiAutoCatalog ?? true;
  const aiAutoAppraise = settings?.aiAutoAppraise ?? true;

  let aiUpdate: Record<string, unknown> = {
    aiProcessedAt: new Date(),
  };

  // Step 1: AI Cataloging — identify, describe, categorize
  if (aiAutoCatalog) {
    try {
      const catalog = await catalogLotFromImages(imageUrls);
      aiUpdate = {
        ...aiUpdate,
        aiTitle: catalog.title,
        aiDescription: catalog.description,
        aiCategory: catalog.suggestedCategory,
        aiCondition: catalog.condition,
        aiTags: catalog.tags,
        aiArtist: catalog.artist || null,
        aiPeriod: catalog.period || null,
        aiMedium: catalog.medium || null,
        aiOrigin: catalog.origin || null,
      };
      logger.info('AI cataloging complete', { consignmentId, title: catalog.title });
    } catch (err) {
      logger.error('AI cataloging failed', { consignmentId, error: err });
    }
  }

  // Step 2: AI Appraisal — estimate value
  if (aiAutoAppraise) {
    try {
      const appraisal = await appraiseLot({
        imageUrls,
        title: (aiUpdate.aiTitle as string) || sellerTitle,
        artist: (aiUpdate.aiArtist as string) || undefined,
        medium: (aiUpdate.aiMedium as string) || undefined,
        period: (aiUpdate.aiPeriod as string) || undefined,
        condition: (aiUpdate.aiCondition as string) || undefined,
      });
      aiUpdate = {
        ...aiUpdate,
        aiEstimateLow: appraisal.estimateLow,
        aiEstimateHigh: appraisal.estimateHigh,
        aiConfidence: String(appraisal.confidence),
        // Use AI estimate if seller didn't provide one
        estimatedValue: appraisal.estimateHigh,
      };
      logger.info('AI appraisal complete', {
        consignmentId,
        low: appraisal.estimateLow,
        high: appraisal.estimateHigh,
        confidence: appraisal.confidence,
      });

      // Step 3: Auto-approve if conditions are met
      if (settings?.autoApproveConsignments) {
        const maxValue = settings.autoApproveMaxValue || 500000;
        const minConfidence = (settings.autoApproveMinConfidence || 70) / 100;

        if (
          appraisal.estimateHigh <= maxValue &&
          appraisal.confidence >= minConfidence
        ) {
          aiUpdate = {
            ...aiUpdate,
            status: 'approved',
            autoApproved: true,
            reviewNotes: `Auto-approved: AI confidence ${(appraisal.confidence * 100).toFixed(0)}%, estimated value $${(appraisal.estimateHigh / 100).toLocaleString()}`,
          };
          logger.info('Consignment auto-approved', { consignmentId });
        }
      }
    } catch (err) {
      logger.error('AI appraisal failed', { consignmentId, error: err });
    }
  }

  // Save AI results
  await db.update(consignments)
    .set({ ...aiUpdate, updatedAt: new Date() })
    .where(eq(consignments.id, consignmentId));
}
