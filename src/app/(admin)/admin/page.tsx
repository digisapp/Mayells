'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Gavel, Image, Users as UsersIcon, FileText, Package, BarChart3,
  Mail, Plus, ClipboardCheck, Brain, Camera, AlertCircle,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-700',
  processing: 'bg-yellow-100 text-yellow-700',
  review: 'bg-orange-100 text-orange-700',
  sent: 'bg-green-100 text-green-700',
};

interface DashboardData {
  stats: { label: string; value: number }[];
  recentConsignments: { id: string; title: string | null; status: string; createdAt: string }[];
  recentAppraisals: { id: string; clientName: string; itemCount: number; status: string; createdAt: string }[];
  appraisalReviewCount: number;
  outreachFollowUpCount: number;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load dashboard (${r.status})`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-6 space-y-3">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-5 space-y-3">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
        <p className="text-muted-foreground mb-4">{error || 'Unknown error'}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  const quickLinks = [
    { href: '/admin/auctions', label: 'Auctions', icon: Gavel, desc: 'Create and manage auctions' },
    { href: '/admin/lots', label: 'Lots', icon: Image, desc: 'Manage lots and catalog' },
    { href: '/admin/consignments', label: 'Consignments', icon: Package, desc: 'Review consignment submissions' },
    { href: '/admin/appraisals', label: 'Appraisals', icon: ClipboardCheck, desc: `Estate appraisals (${data.appraisalReviewCount} need review)` },
    { href: '/admin/outreach', label: 'Outreach', icon: Mail, desc: `Leads & follow-ups (${data.outreachFollowUpCount} pending)` },
    { href: '/admin/users', label: 'Users', icon: UsersIcon, desc: 'Manage accounts' },
    { href: '/admin/ai', label: 'AI Tools', icon: Brain, desc: 'Catalog, appraise, authenticate' },
    { href: '/admin/submissions', label: 'Submissions', icon: Camera, desc: 'Consignment/appraisal photos' },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, desc: 'Reports and insights' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-display-sm">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage auctions, lots, and consignments</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/auctions/new">
            <Button className="gap-2"><Plus className="h-4 w-4" />New Auction</Button>
          </Link>
          <Link href="/admin/lots/new">
            <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New Lot</Button>
          </Link>
          <Link href="/admin/appraisals/new">
            <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New Appraisal</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        {data.stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:border-champagne/50 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-2">
                <item.icon className="h-5 w-5 text-champagne" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-base">{item.label}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Consignments</CardTitle>
              <Link href="/admin/consignments" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentConsignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No consignments yet</p>
            ) : (
              <div className="space-y-3">
                {data.recentConsignments.map((c) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{c.title || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <Badge className={statusColors[c.status] || 'bg-gray-100 text-gray-700'}>
                      {c.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Appraisals</CardTitle>
              <Link href="/admin/appraisals" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentAppraisals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appraisals yet</p>
            ) : (
              <div className="space-y-3">
                {data.recentAppraisals.map((a) => (
                  <Link key={a.id} href={`/admin/appraisals/${a.id}`} className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium group-hover:underline">{a.clientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.itemCount} items · {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <Badge className={statusColors[a.status] || 'bg-gray-100 text-gray-700'}>
                      {a.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
