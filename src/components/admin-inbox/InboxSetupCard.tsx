'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, RefreshCw, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { InboxStatus } from './types';

interface Props {
  status: InboxStatus;
  loading: boolean;
  onRecheck: () => void;
  onSendTest: () => void;
  sendingTest: boolean;
}

function RecordStatus({ s }: { s: string }) {
  if (s === 'verified') return <Badge variant="secondary" className="bg-green-100 text-green-800">Verified</Badge>;
  if (s === 'pending') return <Badge variant="secondary" className="bg-amber-100 text-amber-800">Pending</Badge>;
  return (
    <Badge variant="secondary" className="bg-red-100 text-red-800">
      {s === 'missing' ? 'Missing' : s === 'not_started' ? 'Not added' : s === 'temporary_failure' ? 'Retrying' : 'Failed'}
    </Badge>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});
      }}
      title="Copy"
      className="group inline-flex max-w-full items-center gap-1 text-left font-mono text-xs text-foreground hover:text-champagne"
    >
      <span className="break-all">{value}</span>
      <Copy className={cn('h-3 w-3 shrink-0', copied ? 'text-green-600' : 'text-muted-foreground/50 group-hover:text-champagne')} />
    </button>
  );
}

function DnsTable({ title, records }: { title: string; records: InboxStatus['domain']['records'] }) {
  if (records.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">{title}</p>
      {/* Phones: one card per record — a six-column table crushes Host and
          Value to a character per line, and these get copied at a registrar. */}
      <ul className="space-y-2 sm:hidden">
        {records.map((r) => (
          <li key={`${r.record}-${r.type}-${r.host}`} className="rounded-lg border border-amber-200 bg-background px-3 py-2.5 text-xs">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-foreground/80">
                {r.record} · <span className="font-mono text-foreground">{r.type}</span>
                {r.priority !== undefined && <> · priority <span className="font-mono text-foreground">{r.priority}</span></>}
              </span>
              <RecordStatus s={r.status} />
            </div>
            <dl className="space-y-1">
              <div>
                <dt className="text-muted-foreground">Host</dt>
                <dd><CopyValue value={r.host} /></dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Value</dt>
                <dd><CopyValue value={r.value} /></dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border border-amber-200 bg-background sm:block">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Purpose</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Host</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {records.map((r) => (
              <tr key={`${r.record}-${r.type}-${r.host}`} className="align-top">
                <td className="px-3 py-2 text-foreground/80">{r.record}</td>
                <td className="px-3 py-2 font-mono text-foreground">{r.type}</td>
                <td className="whitespace-nowrap px-3 py-2"><CopyValue value={r.host} /></td>
                <td className="max-w-[360px] px-3 py-2"><CopyValue value={r.value} /></td>
                <td className="px-3 py-2 font-mono text-foreground">{r.priority ?? '—'}</td>
                <td className="px-3 py-2"><RecordStatus s={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Shown while mail can't reach the inbox. Lists what is missing in fix
 * order plus the exact DNS records Resend wants, so the admin can finish
 * the setup at the registrar without opening Resend. Collapses to a green
 * bar (with "Send me a test") once everything checks out.
 */
export function InboxSetupCard({ status, loading, onRecheck, onSendTest, sendingTest }: Props) {
  const [open, setOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const sendingWorks = status.env.resendApiKey;

  if (status.ready) {
    // One quiet line once everything works. The warnings (missing delivery
    // events, the shared Resend account) are standing facts, not news, so
    // they wait behind a toggle instead of taking the top of the inbox
    // every day.
    const notes = status.warnings.length;
    return (
      <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="flex min-w-0 items-center gap-2 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              Receiving is on for <span className="font-mono">{status.inboundDomain}</span>. Replies go out as {status.from}.
            </span>
          </p>
          <div className="flex items-center gap-1.5">
            {notes > 0 && (
              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                aria-expanded={notesOpen}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-green-900/80 hover:bg-green-100 hover:text-green-900"
              >
                {notes === 1 ? '1 note' : `${notes} notes`}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', notesOpen && 'rotate-180')} />
              </button>
            )}
            <Button size="sm" variant="outline" onClick={onRecheck} disabled={loading} aria-label="Re-check" title="Re-check">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
            <Button size="sm" variant="outline" onClick={onSendTest} disabled={sendingTest}>
              <Send className="h-3.5 w-3.5" /> {sendingTest ? 'Sending…' : 'Send me a test'}
            </Button>
          </div>
        </div>
        {notesOpen && notes > 0 && (
          <ul className="mt-2 list-disc space-y-1 border-t border-green-200 pl-6 pt-2 text-xs text-green-900/80">
            {status.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <span>
            <span className="block text-sm font-semibold text-amber-900">This inbox can&apos;t receive mail yet</span>
            <span className="block text-xs text-amber-800">
              {sendingWorks ? 'Sending works; incoming' : 'Incoming'} mail to <span className="font-mono">{status.inboundAddress}</span> has nowhere to land until the steps below are done.
            </span>
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-amber-700 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-amber-200 px-4 py-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-amber-900">
            {status.problems.map((p) => <li key={p}>{p}</li>)}
          </ol>

          {status.domain.found && <DnsTable title={`DNS records for ${status.domain.name} (at the registrar)`} records={status.domain.records} />}
          {status.fromDomain?.found && <DnsTable title={`DNS records for ${status.fromDomain.name} (replies are sent from it)`} records={status.fromDomain.records} />}

          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-amber-200 bg-background px-3 py-2">
              <dt className="text-muted-foreground">Resend domain</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-foreground">
                <span className="font-mono">{status.inboundDomain}</span>
                {status.domain.found ? (
                  <>
                    <RecordStatus s={status.domain.status ?? 'failed'} />
                    <Badge variant="secondary" className={status.domain.receiving === 'enabled' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      receiving {status.domain.receiving ?? 'off'}
                    </Badge>
                  </>
                ) : <Badge variant="secondary" className="bg-red-100 text-red-800">Not in Resend</Badge>}
              </dd>
            </div>
            <div className="rounded-lg border border-amber-200 bg-background px-3 py-2">
              <dt className="text-muted-foreground">Resend webhook</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-foreground">
                <span className="break-all font-mono">{status.webhook.endpoint ?? 'none'}</span>
                {status.webhook.found
                  ? (
                    <Badge variant="secondary" className={status.webhook.canonical && status.webhook.status === 'enabled' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {status.webhook.canonical ? status.webhook.status : 'wrong URL'}
                    </Badge>
                  )
                  : <Badge variant="secondary" className="bg-red-100 text-red-800">Missing</Badge>}
              </dd>
            </div>
          </dl>

          {status.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800">
              {status.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onRecheck} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Re-check
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onSendTest}
              disabled={sendingTest || !sendingWorks}
              title={sendingWorks ? 'Sends a test email to your admin address' : 'RESEND_API_KEY is missing'}
            >
              <Send className="h-3.5 w-3.5" /> {sendingTest ? 'Sending…' : 'Send me a test'}
            </Button>
            <span className="text-xs text-amber-800">Checked {new Date(status.checkedAt).toLocaleTimeString('en-US')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
