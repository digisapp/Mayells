'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Search, ChevronLeft, ChevronRight, Users, Shield, Ban, ShieldCheck, EyeOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/types';
import { isSentinelEmail } from '@/lib/sellers/sentinel';
import {
  verificationLabel, roleColors, accountStatusColors as statusColors, USER_ROLES, ACCOUNT_STATUSES, readError,
} from './user-badges';

interface UserRow {
  id: string;
  email: string;
  fullName: string | null;
  displayName: string | null;
  role: string;
  isAdmin: boolean;
  accountStatus: string;
  cardVerifiedAt: string | null;
  identityVerifiedAt: string | null;
  paddleNumber: string | null;
  companyName: string | null;
  createdAt: string;
  lotCount: number;
  soldCount: number;
  consignmentCount: number;
  bidCount: number;
  salesTotalCents: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type Filter = 'all' | 'consignors' | 'bidders' | 'admins' | 'suspended' | 'shadow';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'consignors', label: 'Consignors' },
  { value: 'bidders', label: 'Bidders' },
  { value: 'admins', label: 'Admins' },
  { value: 'suspended', label: 'Suspended / Banned' },
  { value: 'shadow', label: 'Shadow' },
];

function isFilter(v: string | null): v is Filter {
  return !!v && FILTERS.some((f) => f.value === v);
}

function displayName(u: UserRow): string {
  return u.fullName || u.displayName || (isSentinelEmail(u.email) ? 'Shadow consignor' : u.email);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={statusColors[status] || ''}>
      {status === 'banned' && <Ban className="h-2.5 w-2.5 mr-1" />}
      {status === 'active' && <Shield className="h-2.5 w-2.5 mr-1" />}
      {status}
    </Badge>
  );
}

function AdminUsersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlFilter = searchParams.get('filter');

  const [userList, setUserList] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<Filter>(isFilter(urlFilter) ? urlFilter : 'all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ user: UserRow; updates: { role?: string; accountStatus?: string }; title: string; description: string } | null>(null);

  // Keep the chip in sync when the URL changes (sidebar link, back button)
  useEffect(() => {
    if (isFilter(urlFilter) && urlFilter !== filter) setFilter(urlFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFilter]);

  const fetchUsers = useCallback((page: number, search: string, currentFilter: Filter) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    if (currentFilter !== 'all') params.set('filter', currentFilter);

    fetch(`/api/admin/users?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await readError(r, 'Failed to load users'));
        return r.json();
      })
      .then((d) => {
        setLoadError(null);
        setUserList(d.data ?? []);
        if (d.pagination) setPagination(d.pagination);
      })
      .catch((err: Error) => {
        setLoadError(err.message);
        toast.error(err.message || 'Failed to load users');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchUsers(pagination.page, searchQuery, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, searchQuery, filter]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function switchFilter(next: Filter) {
    setFilter(next);
    setPagination((p) => ({ ...p, page: 1 }));
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('filter');
    else params.set('filter', next);
    router.replace(`/admin/users${params.size ? `?${params}` : ''}`);
  }

  async function updateUser(id: string, updates: { role?: string; accountStatus?: string }) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setUserList((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
        toast.success('User updated');
        setEditingId(null);
      } else {
        toast.error(await readError(res, 'Failed to update user'));
      }
    } catch {
      toast.error('Network error');
    }
  }

  /** Destructive or privilege-raising changes go through the confirm dialog. */
  function requestUpdate(user: UserRow, updates: { role?: string; accountStatus?: string }) {
    const name = displayName(user);
    if (updates.role === 'admin' && user.role !== 'admin') {
      setPending({
        user, updates,
        title: `Make ${name} an admin?`,
        description: 'Admins can see and change everything in this panel, including money, users, and other admins.',
      });
      return;
    }
    if (updates.accountStatus && ['banned', 'suspended'].includes(updates.accountStatus) && updates.accountStatus !== user.accountStatus) {
      setPending({
        user, updates,
        title: `${updates.accountStatus === 'banned' ? 'Ban' : 'Suspend'} ${name}?`,
        description: updates.accountStatus === 'banned'
          ? 'They will be blocked from bidding and buying. Existing invoices and payouts are unaffected.'
          : 'They will be blocked from bidding until reactivated.',
      });
      return;
    }
    void updateUser(user.id, updates);
  }

  const chips = (
    <div className="flex flex-wrap items-center gap-2">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => switchFilter(f.value)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            filter === f.value
              ? 'border-champagne bg-champagne/15 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-champagne/50'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-display-sm flex items-center gap-3">
            <Users className="h-6 w-6" />
            Users
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pagination.total} {filter === 'all' ? 'total users' : `${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`}
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name, email, company, paddle..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 pr-3 py-1.5 border rounded-md text-sm bg-background w-64 max-w-full"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">Search</Button>
          {searchQuery && (
            <Button type="button" size="sm" variant="ghost" onClick={() => { setSearchInput(''); setSearchQuery(''); setPagination((p) => ({ ...p, page: 1 })); }}>
              Clear
            </Button>
          )}
        </form>
      </div>

      <div className="mb-4">{chips}</div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => fetchUsers(pagination.page, searchQuery, filter)}>Try again</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {userList.map((user) => {
              const shadow = isSentinelEmail(user.email);
              const v = verificationLabel(user);
              return (
                <Link key={user.id} href={`/admin/users/${user.id}`} className="block">
                  <Card className="hover:border-champagne/60 transition-colors">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{displayName(user)}</p>
                          {shadow ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="h-3 w-3" />no email on file</span>
                          ) : (
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          )}
                        </div>
                        <StatusBadge status={user.accountStatus} />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge className={roleColors[user.role] || ''}>{user.role}</Badge>
                        {user.isAdmin && user.role !== 'admin' && <Badge className="bg-red-100 text-red-800"><ShieldCheck className="h-2.5 w-2.5 mr-1" />admin flag</Badge>}
                        <Badge className={v.className}>{v.label}</Badge>
                        {user.paddleNumber && <Badge variant="outline">#{user.paddleNumber}</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Consigned {user.lotCount + user.consignmentCount} · Sold {user.soldCount}{user.salesTotalCents > 0 ? ` (${formatCurrency(user.salesTotalCents)})` : ''}</span>
                        <span>Bids {user.bidCount}</span>
                        <span>Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
            {userList.length === 0 && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                {searchQuery ? `No users matching "${searchQuery}"` : 'No users match this filter.'}
              </CardContent></Card>
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Paddle</TableHead>
                  <TableHead>Consigned / Sold</TableHead>
                  <TableHead>Bids</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[90px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userList.map((user) => {
                  const shadow = isSentinelEmail(user.email);
                  const v = verificationLabel(user);
                  const editing = editingId === user.id;
                  return (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer"
                      onClick={() => { if (!editing) router.push(`/admin/users/${user.id}`); }}
                    >
                      <TableCell>
                        <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {displayName(user)}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {shadow ? (
                            <span className="inline-flex items-center gap-1"><EyeOff className="h-3 w-3" />no email on file</span>
                          ) : user.email}
                          {user.companyName && <span> · {user.companyName}</span>}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => editing && e.stopPropagation()}>
                        {editing ? (
                          <select
                            value={user.role}
                            onChange={(e) => requestUpdate(user, { role: e.target.value })}
                            className="text-xs border rounded px-2 py-1 bg-background"
                          >
                            {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            <Badge className={roleColors[user.role] || ''}>{user.role}</Badge>
                            {user.isAdmin && user.role !== 'admin' && (
                              <Badge className="bg-red-100 text-red-800" title="is_admin flag"><ShieldCheck className="h-2.5 w-2.5 mr-1" />admin</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => editing && e.stopPropagation()}>
                        {editing ? (
                          <select
                            value={user.accountStatus}
                            onChange={(e) => requestUpdate(user, { accountStatus: e.target.value })}
                            className="text-xs border rounded px-2 py-1 bg-background"
                          >
                            {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <StatusBadge status={user.accountStatus} />
                        )}
                      </TableCell>
                      <TableCell><Badge className={v.className}>{v.label}</Badge></TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {user.paddleNumber ? `#${user.paddleNumber}` : '—'}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {user.lotCount + user.consignmentCount > 0 ? (
                          <>
                            {user.lotCount + user.consignmentCount} / {user.soldCount}
                            {user.salesTotalCents > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">({formatCurrency(user.salesTotalCents)})</span>
                            )}
                          </>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="tabular-nums">{user.bidCount > 0 ? user.bidCount : '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs"
                          onClick={() => setEditingId(editing ? null : user.id)}
                        >
                          {editing ? 'Done' : 'Edit'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {userList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {searchQuery ? `No users matching "${searchQuery}"` : 'No users match this filter.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={pagination.page <= 1}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        title={pending?.title ?? ''}
        description={pending?.description}
        confirmLabel={pending?.updates.accountStatus === 'banned' ? 'Ban user' : pending?.updates.accountStatus === 'suspended' ? 'Suspend' : 'Make admin'}
        variant={pending?.updates.accountStatus ? 'destructive' : 'default'}
        onConfirm={async () => { if (pending) await updateUser(pending.user.id, pending.updates); }}
      />
    </div>
  );
}

export default function AdminUsersPage() {
  // useSearchParams (?filter=) requires a Suspense boundary
  return (
    <Suspense fallback={<div className="h-24 bg-muted animate-pulse rounded-lg" />}>
      <AdminUsersPageInner />
    </Suspense>
  );
}
