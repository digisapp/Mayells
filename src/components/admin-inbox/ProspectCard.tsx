'use client';

import Link from 'next/link';
import { ExternalLink, MessageSquare, Package, Phone, PhoneOff, MapPin } from 'lucide-react';
import { PROSPECT_STATUS, PROSPECT_STATUS_ORDER } from '@/lib/admin/status/sales';
import { MICROSITE_LABELS } from '@/lib/microsites/labels';
import { cn } from '@/lib/utils';
import type { ProspectSummary } from './types';

/** "+15619877200" → "(561) 987-7200"; anything else as stored. */
export function displayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const us = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.length === 10 ? digits : null;
  return us ? `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}` : phone;
}

/** tel:/sms: want E.164; a bare US number gets +1. */
export function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}

/**
 * Who this conversation is with, at a glance: the seller prospect behind
 * the address, what they have, one tap to call or text them, and their
 * place in the funnel — changeable here, so answering an email and moving
 * the lead along is one stop.
 */
export function ProspectCard({ prospect, onSetStatus }: { prospect: ProspectSummary; onSetStatus: (status: string) => void }) {
  const where = [prospect.city, prospect.site ? MICROSITE_LABELS[prospect.site]?.city ?? prospect.site : null].filter(Boolean).join(' · ');
  const items = [
    prospect.estimatedItemCount ? `${prospect.estimatedItemCount} item${prospect.estimatedItemCount === 1 ? '' : 's'}` : null,
    prospect.itemSummary,
  ].filter(Boolean).join(' · ');
  const pill = 'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors';

  return (
    <section aria-label="Seller prospect" className="border-b border-border/60 bg-champagne/5 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold">{prospect.fullName}</span>
            <span className="text-xs text-muted-foreground">Seller prospect</span>
          </p>
          {where && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {where}
            </p>
          )}
          {items && (
            <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
              <Package className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-2">{items}</span>
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Status
          <select
            value={prospect.status}
            onChange={(e) => onSetStatus(e.target.value)}
            aria-label="Prospect status"
            className={cn(
              'h-8 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            )}
          >
            {PROSPECT_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>{PROSPECT_STATUS[value].label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {prospect.phone ? (
          <>
            <a href={`tel:${dialable(prospect.phone)}`} className={cn(pill, 'border-charcoal bg-charcoal text-champagne hover:bg-charcoal/90')}>
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
            <a href={`sms:${dialable(prospect.phone)}`} className={cn(pill, 'border-border bg-background text-foreground hover:bg-muted')}>
              <MessageSquare className="h-3.5 w-3.5" /> Text
            </a>
            <span className="text-sm tabular-nums text-foreground/90">{displayPhone(prospect.phone)}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <PhoneOff className="h-3.5 w-3.5" /> No phone on file.
          </span>
        )}
        <Link
          href={`/admin/prospects/${prospect.id}`}
          className="ml-auto inline-flex items-center gap-1 text-xs text-champagne transition-colors hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Open prospect
        </Link>
      </div>
    </section>
  );
}
