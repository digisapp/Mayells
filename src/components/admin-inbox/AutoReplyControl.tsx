'use client';

import { useState } from 'react';
import { Bot, Info } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { cn } from '@/lib/utils';
import { AUTO_REPLY_CATEGORY_LABELS } from './types';

interface Props {
  enabled: boolean;
  loading: boolean;
  from: string;
  onChange: (next: boolean) => Promise<void> | void;
}

/**
 * The AI auto-reply switch, on the inbox itself. Turning it ON asks first —
 * it means real emails to real people without anyone reading them — and the
 * info button explains exactly which mail the AI answers on its own.
 */
export function AutoReplyControl({ enabled, loading, from, onChange }: Props) {
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <div
        className={cn(
          'flex items-stretch overflow-hidden rounded-md border text-xs font-medium',
          enabled ? 'border-champagne/60 bg-champagne/10 text-foreground' : 'border-border bg-background text-muted-foreground',
        )}
      >
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={loading}
          onClick={() => (enabled ? onChange(false) : setConfirmEnable(true))}
          className="flex items-center gap-2 px-3 py-2 disabled:opacity-60"
          title={enabled ? 'AI auto-reply is on' : 'AI auto-reply is off'}
        >
          <Bot className="h-3.5 w-3.5" />
          <span>Auto-reply</span>
          <span className={cn('relative h-4 w-7 rounded-full transition-colors', enabled ? 'bg-champagne' : 'bg-muted-foreground/30')}>
            <span className={cn('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-3.5' : 'translate-x-0.5')} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowInfo(true)}
          className="border-l border-inherit px-2 hover:bg-muted/50"
          aria-label="About AI auto-reply"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>

      <ConfirmDialog
        open={confirmEnable}
        onOpenChange={setConfirmEnable}
        title="Turn on AI auto-reply?"
        description={`Incoming mail the AI is at least 85% sure is an appraisal, consignment, purchase, auction, estate, scheduling or general inquiry gets an AI-written reply sent automatically as ${from}. Everything else still waits for you. You can turn this off at any time.`}
        confirmLabel="Turn it on"
        cancelLabel="Not now"
        onConfirm={() => onChange(true)}
      />

      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>About AI auto-reply</DialogTitle>
            <DialogDescription>
              Every incoming email is read by the AI, which writes a one-line summary and a suggested reply you can send or edit.
              With auto-reply off (the default), nothing is sent without you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
            <div>
              <p className="mb-1 font-semibold text-foreground">With auto-reply on, the AI answers by itself for:</p>
              <ul className="ml-4 list-disc space-y-0.5 marker:text-champagne">
                {AUTO_REPLY_CATEGORY_LABELS.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Only when it is at least 85% confident, never twice in 24 hours on one thread, at most three times in a thread,
                and never to no-reply, out-of-office, list mail or our own addresses.
              </p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-foreground">Always waits for you:</p>
              <ul className="ml-4 list-disc space-y-0.5 marker:text-amber-500">
                <li>Feedback and complaints</li>
                <li>Partnerships and media</li>
                <li>Account and billing support</li>
                <li>Personal mail, spam and anything unclear</li>
              </ul>
            </div>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Auto-replies are real emails to real people, sent as {from}. They show in the thread with an AI badge and under Needs review.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInfo(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
