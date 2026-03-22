'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, ChevronLeft, ChevronRight, Users, Shield, Ban } from 'lucide-react';
import { toast } from 'sonner';

interface UserRow {
  id: string;
  email: string;
  fullName: string | null;
  displayName: string | null;
  role: string;
  accountStatus: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-800',
  auctioneer: 'bg-purple-100 text-purple-800',
  seller: 'bg-blue-100 text-blue-800',
  buyer: 'bg-green-100 text-green-800',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-yellow-100 text-yellow-800',
  banned: 'bg-red-100 text-red-800',
};

const roles = ['buyer', 'seller', 'auctioneer', 'admin'];
const statuses = ['active', 'suspended', 'banned'];

export default function AdminUsersPage() {
  const [userList, setUserList] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchUsers = useCallback((page: number, search: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);

    fetch(`/api/admin/users?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setUserList(d.data ?? []);
        if (d.pagination) setPagination(d.pagination);
      })
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchUsers(pagination.page, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, searchQuery]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPagination((p) => ({ ...p, page: 1 }));
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
        const err = await res.json();
        toast.error(err.error || 'Failed to update user');
      }
    } catch {
      toast.error('Network error');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-display-sm flex items-center gap-3">
            <Users className="h-6 w-6" />
            Users
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pagination.total} total users
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 pr-3 py-1.5 border rounded-md text-sm bg-background w-64"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">Search</Button>
          {searchQuery && (
            <Button type="button" size="sm" variant="ghost" onClick={() => { setSearchInput(''); setSearchQuery(''); }}>
              Clear
            </Button>
          )}
        </form>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
        </div>
      ) : (
        <>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userList.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.fullName || user.displayName || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      {editingId === user.id ? (
                        <select
                          value={user.role}
                          onChange={(e) => updateUser(user.id, { role: e.target.value })}
                          className="text-xs border rounded px-2 py-1 bg-background"
                        >
                          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <Badge className={roleColors[user.role] || ''}>{user.role}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === user.id ? (
                        <select
                          value={user.accountStatus}
                          onChange={(e) => updateUser(user.id, { accountStatus: e.target.value })}
                          className="text-xs border rounded px-2 py-1 bg-background"
                        >
                          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <Badge className={statusColors[user.accountStatus] || ''}>
                          {user.accountStatus === 'banned' && <Ban className="h-2.5 w-2.5 mr-1" />}
                          {user.accountStatus === 'active' && <Shield className="h-2.5 w-2.5 mr-1" />}
                          {user.accountStatus}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => setEditingId(editingId === user.id ? null : user.id)}
                      >
                        {editingId === user.id ? 'Done' : 'Edit'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {userList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {searchQuery ? `No users matching "${searchQuery}"` : 'No users yet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
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
    </div>
  );
}
