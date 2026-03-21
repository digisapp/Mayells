'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Truck, Package, MapPin, ExternalLink } from 'lucide-react';

interface ShipmentRow {
  shipment: {
    id: string;
    status: string;
    method: string;
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    fromCity: string;
    fromState: string;
    toCity: string;
    toState: string;
    toName: string;
    shippingCost: number;
    createdAt: string;
  };
  seller: {
    id: string;
    fullName: string | null;
    email: string;
  };
}

const statusColors: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  label_created: 'secondary',
  pickup_scheduled: 'secondary',
  picked_up: 'secondary',
  in_transit: 'default',
  out_for_delivery: 'default',
  delivered: 'default',
  exception: 'destructive',
  returned: 'destructive',
};

export default function AdminShipmentsPage() {
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/shipments')
      .then(res => res.json())
      .then(data => { setShipments(data.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="font-display text-display-sm mb-6">Shipments</h1>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-muted/30 rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  const pending = shipments.filter(s => ['pending', 'label_created'].includes(s.shipment.status));
  const inTransit = shipments.filter(s => ['pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery'].includes(s.shipment.status));
  const completed = shipments.filter(s => ['delivered', 'returned', 'exception'].includes(s.shipment.status));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-display-sm flex items-center gap-3">
            <Truck className="h-6 w-6" />
            Shipments
          </h1>
          <p className="text-muted-foreground mt-1">{shipments.length} total shipments</p>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            {pending.length} pending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            {inTransit.length} in transit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {completed.length} completed
          </span>
        </div>
      </div>

      {shipments.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No shipments yet. They appear here after buyers pay invoices.</p>
        </div>
      )}

      <div className="border border-border/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/20 border-b border-border/50">
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Seller</th>
              <th className="text-left px-4 py-3 font-medium">Route</th>
              <th className="text-left px-4 py-3 font-medium">Tracking</th>
              <th className="text-left px-4 py-3 font-medium">Method</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map(({ shipment, seller }) => (
              <tr key={shipment.id} className="border-b border-border/30 hover:bg-muted/10">
                <td className="px-4 py-3">
                  <Badge variant={statusColors[shipment.status] || 'outline'}>
                    {shipment.status.replace(/_/g, ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{seller.fullName || 'Unknown'}</div>
                  <div className="text-xs text-muted-foreground">{seller.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {shipment.fromCity}, {shipment.fromState}
                    <span className="mx-1">→</span>
                    {shipment.toCity}, {shipment.toState}
                  </div>
                  <div className="text-xs text-muted-foreground">{shipment.toName}</div>
                </td>
                <td className="px-4 py-3">
                  {shipment.trackingNumber ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs">{shipment.trackingNumber}</span>
                      {shipment.trackingUrl && (
                        <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 text-champagne" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="capitalize">{shipment.method.replace(/_/g, ' ')}</span>
                  {shipment.carrier && (
                    <span className="text-xs text-muted-foreground ml-1">({shipment.carrier.toUpperCase()})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(shipment.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
