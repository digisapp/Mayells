'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/types';
import { ShoppingBag, Shield, Truck, Phone, Mail } from 'lucide-react';
import { BUSINESS } from '@/lib/config';

interface BuyNowPanelProps {
  lotId: string;
  title: string;
  buyNowPrice: number;
  estimateLow?: number | null;
  estimateHigh?: number | null;
}

export function BuyNowPanel({ lotId, title, buyNowPrice, estimateLow, estimateHigh }: BuyNowPanelProps) {
  const [showContact, setShowContact] = useState(false);

  return (
    <div className="bg-card border border-border/50 rounded-xl p-6 space-y-6 shadow-luxury sticky top-24">
      {/* Price */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Price</p>
        <p className="font-display text-display-md">{formatCurrency(buyNowPrice)}</p>
        {estimateLow && estimateHigh && (
          <p className="text-sm text-muted-foreground mt-1">
            Est. {formatCurrency(estimateLow)} — {formatCurrency(estimateHigh)}
          </p>
        )}
      </div>

      {/* Inquire / Contact */}
      {!showContact ? (
        <Button
          variant="champagne"
          size="xl"
          className="w-full gap-2"
          onClick={() => setShowContact(true)}
        >
          <ShoppingBag className="h-5 w-5" />
          Inquire to Purchase
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <p className="font-medium mb-2">Contact us to purchase</p>
            <div className="space-y-2">
              <a
                href={`mailto:${BUSINESS.email}?subject=Purchase Inquiry: ${encodeURIComponent(title)}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-4 w-4" />
                {BUSINESS.email}
              </a>
              <a
                href={BUSINESS.phoneHref}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Phone className="h-4 w-4" />
                {BUSINESS.phone}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Trust badges */}
      <div className="border-t border-border/30 pt-4 space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 shrink-0" />
          <span>Authenticity guaranteed</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Truck className="h-4 w-4 shrink-0" />
          <span>Secure worldwide shipping</span>
        </div>
      </div>
    </div>
  );
}
