'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gavel, Trophy, Heart, FileText, Package, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const { profile } = useAuth();
  const { isSeller, isAdmin } = useRole();

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-display-sm">
          Welcome back, {profile?.fullName || 'there'}
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your bids, won lots, and account settings.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/bids">
          <Card className="hover:border-champagne/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <Gavel className="h-5 w-5 text-champagne" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-base">Active Bids</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">View and manage your current bids</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/won">
          <Card className="hover:border-champagne/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <Trophy className="h-5 w-5 text-champagne" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-base">Won Lots</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Lots you&apos;ve won and payment status</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/watchlist">
          <Card className="hover:border-champagne/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <Heart className="h-5 w-5 text-champagne" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-base">Watchlist</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Lots you&apos;re following</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/invoices">
          <Card className="hover:border-champagne/50 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <FileText className="h-5 w-5 text-champagne" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-base">Invoices</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">View and pay your invoices</p>
            </CardContent>
          </Card>
        </Link>

        {isSeller && (
          <Link href="/consign">
            <Card className="hover:border-champagne/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <Package className="h-5 w-5 text-champagne" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-base">Consignments</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Track your consigned items</p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {isAdmin && (
        <div className="mt-8">
          <Link href="/admin">
            <Button variant="outline" className="gap-2">
              Go to Admin Panel
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
