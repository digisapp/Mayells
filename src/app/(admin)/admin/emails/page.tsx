'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SandboxedEmail } from '@/components/admin/SandboxedEmail';
import {
  Inbox, Send, Mail, Reply, Plus, ChevronDown, ChevronUp, Circle,
  Search, ChevronLeft, ChevronRight, CheckCheck, AlertTriangle, Clock,
  ShieldAlert, User,
} from 'lucide-react';
import { toast } from 'sonner';

interface EmailRow {
  id: string;
  resendId: string | null;
  direction: 'inbound' | 'outbound';
  status: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  toName: string | null;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  inReplyToId: string | null;
  threadId: string | null;
  userId: string | null;
  isSpam: boolean;
  createdAt: string;
  user?: { fullName: string | null; email: string } | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type Tab = 'inbox' | 'sent' | 'spam';

const statusBadgeStyles: Record<string, { className: string; label: string; icon?: React.ReactNode }> = {
  received: { className: 'bg-blue-100 text-blue-800', label: 'New', icon: <Circle className="h-2.5 w-2.5 fill-blue-500" /> },
  read: { className: 'bg-gray-100 text-gray-800', label: 'Read' },
  replied: { className: 'bg-green-100 text-green-800', label: 'Replied', icon: <Reply className="h-3 w-3" /> },
  sent: { className: 'bg-champagne/20 text-champagne', label: 'Sent', icon: <Clock className="h-3 w-3" /> },
  delivered: { className: 'bg-green-100 text-green-800', label: 'Delivered', icon: <CheckCheck className="h-3 w-3" /> },
  bounced: { className: 'bg-red-100 text-red-800', label: 'Bounced', icon: <AlertTriangle className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const style = statusBadgeStyles[status] || { className: 'bg-gray-100 text-gray-800', label: status };
  return (
    <Badge variant="secondary" className={`${style.className} gap-1 text-xs`}>
      {style.icon}
      {style.label}
    </Badge>
  );
}

function QuotedOriginal({ email }: { email: EmailRow }) {
  const text = email.bodyText || '';
  if (!text) return null;
  const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
  return (
    <div className="mt-3 border-l-2 border-muted pl-3 text-xs text-muted-foreground">
      <p className="font-medium mb-1">
        On {new Date(email.createdAt).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
        })}, {email.fromName || email.fromEmail} wrote:
      </p>
      <p className="whitespace-pre-wrap">{preview}</p>
    </div>
  );
}

export default function AdminEmailsPage() {
  const [tab, setTab] = useState<Tab>('inbox');
  const [emailList, setEmailList] = useState<EmailRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 30, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Compose state
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  const fetchEmails = useCallback((currentTab: Tab, page: number, search: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });

    if (currentTab === 'spam') {
      params.set('direction', 'inbound');
      params.set('spam', 'true');
    } else {
      params.set('direction', currentTab === 'inbox' ? 'inbound' : 'outbound');
      params.set('spam', 'false');
    }

    if (search) params.set('search', search);

    fetch(`/api/admin/emails?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setEmailList(d.data ?? []);
        if (d.pagination) setPagination(d.pagination);
      })
      .catch(() => toast.error('Failed to load emails'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchEmails(tab, pagination.page, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pagination.page, searchQuery]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function switchTab(newTab: Tab) {
    setTab(newTab);
    setPagination((p) => ({ ...p, page: 1 }));
    setExpandedId(null);
  }

  async function markAsRead(id: string) {
    await fetch('/api/admin/emails', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'read' }),
    });
    setEmailList((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'read' } : e)));
  }

  function handleExpand(email: EmailRow) {
    if (expandedId === email.id) {
      setExpandedId(null);
    } else {
      setExpandedId(email.id);
      if (email.direction === 'inbound' && email.status === 'received') {
        markAsRead(email.id);
      }
    }
  }

  async function handleReply(email: EmailRow) {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.fromEmail,
          subject: `Re: ${(email.subject || '').replace(/^Re:\s*/i, '')}`,
          html: `
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
              ${replyBody.replace(/\n/g, '<br />')}
              <br /><br />
              <div style="border-left: 2px solid #ccc; padding-left: 12px; margin-top: 16px; color: #666; font-size: 13px;">
                <p style="margin: 0 0 4px;">On ${new Date(email.createdAt).toLocaleDateString()}, ${email.fromName || email.fromEmail} wrote:</p>
                <div>${email.bodyHtml || email.bodyText?.replace(/\n/g, '<br />') || ''}</div>
              </div>
            </div>
          `,
          text: `${replyBody}\n\n> On ${new Date(email.createdAt).toLocaleDateString()}, ${email.fromName || email.fromEmail} wrote:\n> ${(email.bodyText || '').split('\n').join('\n> ')}`,
          inReplyToId: email.id,
        }),
      });
      if (res.ok) {
        toast.success(`Reply sent to ${email.fromEmail}`);
        setReplyingTo(null);
        setReplyBody('');
        setEmailList((prev) => prev.map((e) => (e.id === email.id ? { ...e, status: 'replied' } : e)));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to send reply');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSending(false);
    }
  }

  async function handleCompose() {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          html: `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">${composeBody.replace(/\n/g, '<br />')}</div>`,
          text: composeBody,
        }),
      });
      if (res.ok) {
        toast.success(`Email sent to ${composeTo}`);
        setComposing(false);
        setComposeTo('');
        setComposeSubject('');
        setComposeBody('');
        if (tab === 'sent') fetchEmails('sent', 1, searchQuery);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to send');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSending(false);
    }
  }

  const unreadCount = emailList.filter((e) => e.status === 'received' && e.direction === 'inbound').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-display-sm">Email</h1>
          {tab === 'inbox' && pagination.total > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {pagination.total} {pagination.total === 1 ? 'email' : 'emails'}
              {unreadCount > 0 && ` · ${unreadCount} unread`}
            </p>
          )}
        </div>
        <Button
          onClick={() => setComposing(!composing)}
          className="bg-champagne text-charcoal hover:bg-champagne/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Compose
        </Button>
      </div>

      {/* Compose Form */}
      {composing && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="email"
              placeholder="To email address"
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
            />
            <input
              type="text"
              placeholder="Subject"
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm bg-background"
            />
            <Textarea
              placeholder="Write your message..."
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              rows={6}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCompose}
                disabled={sending}
                className="bg-champagne text-charcoal hover:bg-champagne/90"
              >
                <Send className="h-3.5 w-3.5 mr-2" />
                {sending ? 'Sending...' : 'Send'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setComposing(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex gap-1 border-b">
          <button
            onClick={() => switchTab('inbox')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'inbox'
                ? 'border-champagne text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Inbox className="h-4 w-4" />
            Inbox
            {tab === 'inbox' && unreadCount > 0 && (
              <Badge variant="secondary" className="bg-champagne/20 text-champagne text-xs px-1.5 py-0">
                {unreadCount}
              </Badge>
            )}
          </button>
          <button
            onClick={() => switchTab('sent')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'sent'
                ? 'border-champagne text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Send className="h-4 w-4" />
            Sent
          </button>
          <button
            onClick={() => switchTab('spam')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'spam'
                ? 'border-champagne text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            Spam
          </button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search email, name, subject..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 pr-3 py-1.5 border rounded-md text-sm bg-background w-64"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Search
          </Button>
          {searchQuery && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setSearchInput(''); setSearchQuery(''); setPagination((p) => ({ ...p, page: 1 })); }}
            >
              Clear
            </Button>
          )}
        </form>
      </div>

      {/* Email List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : emailList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {searchQuery
                ? `No emails matching "${searchQuery}"`
                : tab === 'inbox' ? 'No incoming emails yet.'
                : tab === 'sent' ? 'No sent emails yet.'
                : 'No spam emails.'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {emailList.map((email) => (
              <Card
                key={email.id}
                className={`transition-colors ${
                  email.status === 'received' && email.direction === 'inbound'
                    ? 'border-champagne/40 bg-champagne/5'
                    : email.status === 'bounced'
                      ? 'border-red-200 bg-red-50/30'
                      : ''
                }`}
              >
                {/* Email Row Header */}
                <button
                  onClick={() => handleExpand(email)}
                  className="w-full text-left px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {email.status === 'received' && email.direction === 'inbound' && (
                      <Circle className="h-2.5 w-2.5 fill-champagne text-champagne flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className={`text-sm truncate ${email.status === 'received' && email.direction === 'inbound' ? 'font-semibold' : ''}`}>
                            {tab === 'inbox' || tab === 'spam'
                              ? email.fromName || email.fromEmail
                              : email.toName || email.toEmail}
                          </p>
                          {email.userId && (
                            <Badge variant="secondary" className="bg-purple-100 text-purple-800 gap-1 text-xs">
                              <User className="h-2.5 w-2.5" />
                              User
                            </Badge>
                          )}
                          <StatusBadge status={email.status} />
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {new Date(email.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className={`text-sm truncate mt-0.5 ${email.status === 'received' && email.direction === 'inbound' ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {email.subject || '(no subject)'}
                      </p>
                      {expandedId !== email.id && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {email.bodyText?.slice(0, 120) || ''}
                        </p>
                      )}
                    </div>
                    {expandedId === email.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                </button>

                {/* Expanded Email Body */}
                {expandedId === email.id && (
                  <CardContent className="pt-0 border-t">
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-3 pt-3">
                      <span>From: <strong className="text-foreground">{email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}</strong></span>
                      <span>To: <strong className="text-foreground">{email.toEmail}</strong></span>
                      {email.userId && (
                        <a
                          href={`/admin/clients?id=${email.userId}`}
                          className="flex items-center gap-1 text-purple-600 hover:text-purple-800 transition-colors"
                        >
                          <User className="h-3 w-3" />
                          View user profile
                        </a>
                      )}
                    </div>

                    {email.bodyHtml ? (
                      <div className="bg-muted/30 rounded-md overflow-hidden">
                        <SandboxedEmail html={email.bodyHtml} className="rounded-md" />
                      </div>
                    ) : email.bodyText ? (
                      <pre className="text-sm bg-muted/30 rounded-md p-4 whitespace-pre-wrap overflow-auto max-h-96">
                        {email.bodyText}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground italic p-4">(no content)</p>
                    )}

                    {/* Reply section (inbox/spam only) */}
                    {(tab === 'inbox' || tab === 'spam') && (
                      <div className="mt-4">
                        {replyingTo === email.id ? (
                          <div className="space-y-3 border-t pt-3">
                            <p className="text-xs text-muted-foreground">
                              Replying to {email.fromName || email.fromEmail}
                            </p>
                            <Textarea
                              placeholder="Write your reply..."
                              value={replyBody}
                              onChange={(e) => setReplyBody(e.target.value)}
                              rows={5}
                              autoFocus
                            />
                            <QuotedOriginal email={email} />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleReply(email)}
                                disabled={sending}
                                className="bg-champagne text-charcoal hover:bg-champagne/90"
                              >
                                <Send className="h-3.5 w-3.5 mr-2" />
                                {sending ? 'Sending...' : 'Send Reply'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setReplyingTo(null);
                                  setReplyBody('');
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReplyingTo(email.id)}
                          >
                            <Reply className="h-3.5 w-3.5 mr-2" />
                            Reply
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} emails)
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
