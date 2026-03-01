'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gavel, Image, Users, FileText, Package, BarChart3, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminDashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-display-sm">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage auctions, lots, and users</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/auctions/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Auction
            </Button>
          </Link>
          <Link href="/admin/lots/new">
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              New Lot
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { href: '/admin/auctions', label: 'Auctions', icon: Gavel, desc: 'Create and manage auction events' },
          { href: '/admin/lots', label: 'Lots', icon: Image, desc: 'Manage lots and catalog items' },
          { href: '/admin/consignments', label: 'Consignments', icon: Package, desc: 'Review consignment submissions' },
          { href: '/admin/users', label: 'Users', icon: Users, desc: 'Manage buyer and seller accounts' },
          { href: '/admin/invoices', label: 'Invoices', icon: FileText, desc: 'View and manage invoices' },
          { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, desc: 'Platform analytics and reports' },
        ].map((item) => (
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
    </div>
  );
}
