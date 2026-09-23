import Link from 'next/link';
import { Globe, Phone, PhoneForwarded } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { micrositeCity } from '@/lib/microsites/labels';

/** A call row as it arrives from the DB (server) or as JSON (client). */
export interface CallView {
  id: string;
  channel: 'phone' | 'web';
  callerNumber: string | null;
  site: string | null;
  prospectId: string | null;
  outcome: 'info' | 'lead' | 'transferred';
  summary: string | null;
  startedAt: string | Date;
  endedAt: string | Date | null;
  durationSeconds: number | null;
}

const outcomeLabel: Record<CallView['outcome'], string> = {
  info: 'Enquiry',
  lead: 'Lead taken',
  transferred: 'Transferred',
};

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/New_York',
});

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

/** "+15615550100" → "(561) 555-0100"; anything else as-is. */
export function formatCaller(number: string | null): string {
  if (!number) return 'Unknown caller';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(number);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : number;
}

/**
 * One voice-concierge conversation: who, when, which line, what came of it,
 * and the notes written from it. Calls are noted, not recorded, so there is
 * no transcript to show.
 */
export function CallCard({ call, showProspectLink = true }: { call: CallView; showProspectLink?: boolean }) {
  const inProgress = !call.endedAt;
  const Icon = call.channel === 'web' ? Globe : call.outcome === 'transferred' ? PhoneForwarded : Phone;

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="font-medium tabular-nums">
          {call.channel === 'web' ? 'Website voice' : formatCaller(call.callerNumber)}
        </span>
        <span className="text-muted-foreground">{dateTime.format(new Date(call.startedAt))}</span>
        {!inProgress && <span className="text-muted-foreground tabular-nums">{formatDuration(call.durationSeconds)}</span>}
        <span className="text-muted-foreground">{call.site ? `${micrositeCity(call.site)} line` : 'Main line'}</span>
        <Badge
          variant="secondary"
          className={cn(
            call.outcome === 'lead' && 'bg-green-100 text-green-800',
            call.outcome === 'transferred' && 'bg-blue-100 text-blue-800',
          )}
        >
          {inProgress ? 'In progress' : outcomeLabel[call.outcome]}
        </Badge>
        {showProspectLink && call.prospectId && (
          <Link href={`/admin/prospects/${call.prospectId}`} className="text-sm underline underline-offset-4">
            Open prospect
          </Link>
        )}
      </div>

      {call.summary ? (
        <p className="text-sm max-w-3xl">{call.summary}</p>
      ) : !inProgress ? (
        <p className="text-sm text-muted-foreground">No notes for this call.</p>
      ) : null}
    </div>
  );
}
