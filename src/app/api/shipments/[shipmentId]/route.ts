import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { shipments } from '@/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { generateLabelForShipment, refreshTracking } from '@/lib/shipping/service';
import { logger } from '@/lib/logger';

/**
 * GET /api/shipments/:shipmentId — get shipment details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  const { shipmentId } = await params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const shipment = await db.query.shipments.findFirst({
      where: and(
        eq(shipments.id, shipmentId),
        or(eq(shipments.sellerId, user.id), eq(shipments.buyerId, user.id)),
      ),
    });

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    return NextResponse.json({ data: shipment });
  } catch (error) {
    logger.error('Shipment detail error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/shipments/:shipmentId — actions on a shipment
 *
 * Body: { action: "generate_label" | "refresh_tracking" | "schedule_pickup" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  const { shipmentId } = await params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify ownership
    const shipment = await db.query.shipments.findFirst({
      where: and(
        eq(shipments.id, shipmentId),
        or(eq(shipments.sellerId, user.id), eq(shipments.buyerId, user.id)),
      ),
    });

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    switch (action) {
      case 'generate_label': {
        if (shipment.sellerId !== user.id) {
          return NextResponse.json({ error: 'Only the seller can generate a label' }, { status: 403 });
        }
        const rateId = typeof body.rateId === 'string' ? body.rateId : undefined;
        const label = await generateLabelForShipment(shipmentId, rateId);
        return NextResponse.json({ data: label });
      }

      case 'refresh_tracking': {
        const tracking = await refreshTracking(shipmentId);
        return NextResponse.json({ data: tracking });
      }

      case 'schedule_pickup': {
        // Update shipment to mark pickup requested
        await db.update(shipments).set({
          method: 'pickup',
          status: 'pickup_scheduled',
          updatedAt: new Date(),
        }).where(eq(shipments.id, shipmentId));

        return NextResponse.json({ data: { message: 'Pickup scheduled. Carrier will contact you.' } });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Shipment action error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
