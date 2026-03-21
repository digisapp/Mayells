'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Package, Truck, Download, MapPin, RefreshCw, Clock } from 'lucide-react';

interface Shipment {
  id: string;
  invoiceId: string;
  lotId: string;
  method: string;
  carrier: string | null;
  status: string;
  labelUrl: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippingCost: number;
  fromName: string;
  fromCity: string;
  fromState: string;
  toName: string;
  toCity: string;
  toState: string;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  createdAt: string;
  role: 'seller' | 'buyer';
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: typeof Package }> = {
  pending: { label: 'Awaiting Payment', variant: 'outline', icon: Clock },
  label_created: { label: 'Label Ready — Ship Now', variant: 'default', icon: Download },
  pickup_scheduled: { label: 'Pickup Scheduled', variant: 'secondary', icon: Truck },
  picked_up: { label: 'Picked Up', variant: 'secondary', icon: Truck },
  in_transit: { label: 'In Transit', variant: 'secondary', icon: Truck },
  out_for_delivery: { label: 'Out for Delivery', variant: 'default', icon: MapPin },
  delivered: { label: 'Delivered', variant: 'default', icon: Package },
  exception: { label: 'Issue — Contact Support', variant: 'destructive', icon: Package },
  returned: { label: 'Returned', variant: 'destructive', icon: Package },
};

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/shipments')
      .then(res => res.json())
      .then(data => {
        setShipments(data.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleAction(shipmentId: string, action: string) {
    const res = await fetch(`/api/shipments/${shipmentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      // Refresh shipments
      const updated = await fetch('/api/shipments').then(r => r.json());
      setShipments(updated.data || []);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <h1 className="font-display text-display-sm mb-6">Shipments</h1>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const sellerShipments = shipments.filter(s => s.role === 'seller');
  const buyerShipments = shipments.filter(s => s.role === 'buyer');

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="font-display text-display-sm mb-2">Shipments</h1>
      <p className="text-muted-foreground mb-8">Track and manage shipping for your sold and purchased items.</p>

      {shipments.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No shipments yet.</p>
          <p className="text-sm mt-1">Shipments appear here after an item sells and the buyer pays.</p>
        </div>
      )}

      {/* Items to Ship (Seller) */}
      {sellerShipments.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-xl mb-4">Items to Ship</h2>
          <div className="space-y-4">
            {sellerShipments.map(shipment => (
              <ShipmentCard
                key={shipment.id}
                shipment={shipment}
                onAction={handleAction}
              />
            ))}
          </div>
        </section>
      )}

      {sellerShipments.length > 0 && buyerShipments.length > 0 && <Separator className="my-8" />}

      {/* Items Purchased (Buyer) */}
      {buyerShipments.length > 0 && (
        <section>
          <h2 className="font-display text-xl mb-4">Purchased Items</h2>
          <div className="space-y-4">
            {buyerShipments.map(shipment => (
              <ShipmentCard
                key={shipment.id}
                shipment={shipment}
                onAction={handleAction}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ShipmentCard({
  shipment,
  onAction,
}: {
  shipment: Shipment;
  onAction: (id: string, action: string) => void;
}) {
  const config = statusConfig[shipment.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <div className="border border-border/50 rounded-lg p-5 bg-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant={config.variant}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
            {shipment.method === 'white_glove' && (
              <Badge variant="outline">White Glove</Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
            <MapPin className="h-3.5 w-3.5" />
            <span>
              {shipment.role === 'seller'
                ? `Ship to: ${shipment.toName} — ${shipment.toCity}, ${shipment.toState}`
                : `From: ${shipment.fromCity}, ${shipment.fromState}`
              }
            </span>
          </div>

          {shipment.trackingNumber && (
            <div className="flex items-center gap-2 text-sm mt-2">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Tracking:</span>
              {shipment.trackingUrl ? (
                <a
                  href={shipment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-champagne hover:underline font-mono text-xs"
                >
                  {shipment.trackingNumber}
                </a>
              ) : (
                <span className="font-mono text-xs">{shipment.trackingNumber}</span>
              )}
            </div>
          )}

          {shipment.carrier && (
            <div className="text-xs text-muted-foreground mt-1">
              Carrier: {shipment.carrier.toUpperCase()}
              {shipment.estimatedDelivery && (
                <> — Est. delivery: {new Date(shipment.estimatedDelivery).toLocaleDateString()}</>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 shrink-0">
          {/* Seller actions */}
          {shipment.role === 'seller' && shipment.status === 'label_created' && shipment.labelUrl && (
            <Button size="sm" asChild>
              <a href={shipment.labelUrl} target="_blank" rel="noopener noreferrer">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download Label
              </a>
            </Button>
          )}

          {shipment.role === 'seller' && shipment.status === 'label_created' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction(shipment.id, 'schedule_pickup')}
            >
              <Truck className="h-3.5 w-3.5 mr-1.5" />
              Schedule Pickup
            </Button>
          )}

          {shipment.role === 'seller' && shipment.status === 'pending' && !shipment.labelUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction(shipment.id, 'generate_label')}
            >
              <Package className="h-3.5 w-3.5 mr-1.5" />
              Generate Label
            </Button>
          )}

          {/* Buyer/seller: refresh tracking */}
          {shipment.trackingNumber && !['delivered', 'returned'].includes(shipment.status) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAction(shipment.id, 'refresh_tracking')}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Update Tracking
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
