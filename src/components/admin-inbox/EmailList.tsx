'use client';

import { Archive, Bell, Bot, Mail, MessageSquare, Paperclip, Reply, Star, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CategoryBadge, StatusBadge } from './badges';
import { formatListDate } from './dates';
import { EMPTY_COPY, conversationUnread, counterpart, type EmailRow, type InboxFolder } from './types';

interface EmailListProps {
  emails: EmailRow[];
  folder: InboxFolder;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  searching: boolean;
  categoryLabel: string | null;
}

export function EmailList({
  emails, folder, selectedId, onSelect, onToggleStar, selectedIds, onToggleSelect, searching, categoryLabel,
}: EmailListProps) {
  if (emails.length === 0) {
    const copy = searching
      ? { title: 'No matches', body: 'Try a different search.' }
      : categoryLabel
        ? { title: `No ${categoryLabel} emails`, body: 'Pick another category or clear the filter.' }
        : EMPTY_COPY[folder];
    return (
      <Card className="border-0 shadow-none">
        <CardContent className="py-16 text-center">
          <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">{copy.title}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{copy.body}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {emails.map((email) => {
        const active = email.id === selectedId;
        const checked = selectedIds.has(email.id);
        // A row is a conversation: bold while any message in it is unread.
        const unread = conversationUnread(email);
        const who = counterpart(email);
        const showStatus = email.direction === 'outbound' ? email.status !== 'sent' : email.status === 'replied';
        // Our own notifications (contact form, service requests) summarise
        // as "platform notification" — the row should show what they say.
        const system = email.aiCategory === 'system';
        const snippet = (!system && email.aiSummary) || email.preview || '';

        return (
          <li
            key={email.id}
            id={`email-${email.id}`}
            className={cn(
              'relative flex items-start gap-2.5 px-3 py-3 transition-colors',
              active ? 'bg-champagne/10' : checked ? 'bg-champagne/5' : 'hover:bg-muted/40',
              email.status === 'bounced' && !active && 'bg-red-50/40',
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggleSelect(email.id)}
              aria-label={`Select conversation with ${who.name}`}
              className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-champagne"
            />

            <button
              type="button"
              onClick={() => onSelect(email.id)}
              aria-current={active ? 'true' : undefined}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn('inline-block h-2 w-2 shrink-0 rounded-full', unread ? 'bg-champagne' : 'bg-transparent')}
                  aria-hidden="true"
                />
                <span className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-sm', unread ? 'font-semibold text-foreground' : 'text-foreground/90')}>
                  {email.direction === 'outbound' && <span className="font-normal text-muted-foreground">To: </span>}
                  {system && <Bell className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Platform notification" />}
                  <span className="truncate">{who.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatListDate(email.createdAt)}</span>
              </div>
              <p className={cn('mt-0.5 flex items-center gap-1.5 pl-4 text-sm', unread ? 'text-foreground' : 'text-muted-foreground')}>
                {email.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className="truncate">{email.subject || '(no subject)'}</span>
                {email.threadCount > 1 && (
                  <span
                    className={cn('ml-auto inline-flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums', unread && email.threadUnread > 1 ? 'text-foreground' : 'text-muted-foreground')}
                    title={`${email.threadCount} messages in this conversation${email.threadUnread > 0 ? `, ${email.threadUnread} unread` : ''}`}
                  >
                    <MessageSquare className="h-3 w-3" />
                    {email.threadCount}
                  </span>
                )}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 pl-4">
                <p className="flex-1 truncate text-xs text-muted-foreground">{snippet}</p>
                {email.userId && (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-800 gap-1 text-[11px]">
                    <User className="h-2.5 w-2.5" />
                    Client
                  </Badge>
                )}
                {email.aiAutoSent && email.direction === 'inbound' && (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700 gap-1 text-[11px]">
                    <Bot className="h-2.5 w-2.5" />
                    Auto-replied
                  </Badge>
                )}
                {email.direction === 'outbound' && email.hasResponse && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 gap-1 text-[11px]">
                    <Reply className="h-3 w-3" />
                    Replied
                  </Badge>
                )}
                {showStatus && <StatusBadge status={email.status} />}
                {email.aiCategory && email.aiCategory !== 'spam' && (
                  <CategoryBadge category={email.aiCategory} />
                )}
                {email.archivedAt && folder !== 'archived' && (
                  <Badge variant="outline" className="gap-1 text-[11px]"><Archive className="h-2.5 w-2.5" />Archived</Badge>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onToggleStar(email.id)}
              aria-label={email.isStarred ? 'Unstar' : 'Star'}
              aria-pressed={email.isStarred}
              className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-amber-500"
            >
              <Star className={cn('h-4 w-4', email.isStarred && 'fill-amber-400 text-amber-400')} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
