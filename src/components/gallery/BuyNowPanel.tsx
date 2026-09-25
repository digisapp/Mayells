'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/types';
import { ShoppingBag, Shield, Truck, Phone, Mail } from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { MobileActionBar, scrollIntoViewBelowNav } from '@/components/lots/MobileActionBar';

interface BuyNowPanelProps {
  title: string;
  buyNowPrice: number;
  estimateLow?: number | null;
  estimateHigh?: number | null;
}

export function BuyNowPanel({ title, buyNowPrice, estimateLow, estimateHigh }: BuyNowPanelProps) {
  const [showContact, setShowContact] = useState(false);
  // The inquire button / contact block: the phone bar shows while it is off screen.
  const [ctaEl, setCtaEl] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // From the phone bar: open the contact options and bring them into view.
  const inquireFromBar = () => {
    setShowContact(true);
    if (panelRef.current) scrollIntoViewBelowNav(panelRef.current);
  };

  return (
    <div ref={panelRef} className="bg-card border border-border/50 rounded-xl p-6 space-y-6 shadow-luxury lg:sticky lg:top-24">
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
      <div ref={setCtaEl}>
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
          <div className="bg-muted/50 rounded-lg px-4 py-3 text-sm">
            <p className="font-medium mb-1">Contact us to purchase</p>
            <a
              href={`mailto:${BUSINESS.email}?subject=${encodeURIComponent(`Purchase Inquiry: ${title}`)}`}
              className="flex min-h-11 items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Mail className="h-4 w-4" />
              {BUSINESS.email}
            </a>
            <a
              href={BUSINESS.phoneHref}
              className="flex min-h-11 items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Phone className="h-4 w-4" />
              {BUSINESS.phone}
            </a>
          </div>
        )}
      </div>

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

      <MobileActionBar target={ctaEl} enabled label="Purchase this piece">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Price</p>
          <p className="font-display text-xl leading-tight tabular-nums truncate">{formatCurrency(buyNowPrice)}</p>
        </div>
        <Button type="button" variant="champagne" className="h-12 shrink-0 gap-2 rounded-lg px-5 text-[15px]" onClick={inquireFromBar}>
          <ShoppingBag className="h-4 w-4" />
          Inquire to Purchase
        </Button>
      </MobileActionBar>
    </div>
  );
}
