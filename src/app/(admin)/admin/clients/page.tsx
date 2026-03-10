'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Users2, Search } from 'lucide-react';
import { formatCurrency } from '@/types';

interface ClientRow {
  id: string;
  full_name: string | null;
  email: string;
  company_name: string | null;
  phone: string | null;
  created_at: string;
  consignment_count: number;
  lot_count: number;
  sold_count: number;
  total_revenue: number;
}

export default function AdminClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchClients = useCallback(async (query: string) => {
    try {
      const res = await fetch(`/api/admin/clients${query ? `?search=${encodeURIComponent(query)}` : ''}`);
      const data = await res.json();
      setClients(data.data ?? []);
    } catch {
      console.error('Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients('');
  }, [fetchClients]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      fetchClients(search);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, fetchClients]);

  return (
    <div>
      <h1 className="font-display text-display-sm mb-6">Clients</h1>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {search ? 'No clients match your search.' : 'No clients found.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Consignments</th>
                <th className="px-4 py-3 font-medium">Lots</th>
                <th className="px-4 py-3 font-medium">Sold</th>
                <th className="px-4 py-3 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="border-t hover:bg-accent/5 cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/clients/${client.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{client.full_name || 'Unnamed'}</div>
                    <div className="text-xs text-muted-foreground">{client.email}</div>
                    {client.company_name && (
                      <div className="text-xs text-muted-foreground">{client.company_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{client.consignment_count}</td>
                  <td className="px-4 py-3">{client.lot_count}</td>
                  <td className="px-4 py-3">{client.sold_count}</td>
                  <td className="px-4 py-3">
                    {client.total_revenue > 0 ? formatCurrency(client.total_revenue) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
