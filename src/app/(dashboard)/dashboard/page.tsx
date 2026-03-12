'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Gavel,
  Trophy,
  Heart,
  FileText,
  Package,
  DollarSign,
  ScrollText,
  Truck,
  ArrowRight,
  User,
} from 'lucide-react';

export default function DashboardPage() {
  const { profile } = useAuth();
  const { isSeller, isBuyer } = useRole();

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-display-sm">
          Welcome back, {profile?.fullName || 'there'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isBuyer && isSeller
            ? 'Manage your bids, watchlist, consignments, and payouts.'
            : isSeller
              ? 'Track your consignments, documents, and payouts.'
              : 'Manage your bids, won lots, and account.'}
        </p>
      </div>

      {/* Buyer Section */}
      {isBuyer && (
        <div className="mb-8">
          {isSeller && (
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Buying
            </h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/bids">
              <Card className="hover:border-champagne/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <Gavel className="h-5 w-5 text-champagne" />
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base">My Bids</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Active and past bids</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/won">
              <Card className="hover:border-champagne/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <Trophy className="h-5 w-5 text-champagne" />
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base">Won Lots</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Lots won and payment status</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/watchlist">
              <Card className="hover:border-champagne/50 transition-colors cursor-pointer h-full">
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
              <Card className="hover:border-champagne/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <FileText className="h-5 w-5 text-champagne" />
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base">Invoices</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">View and pay invoices</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* Seller Section */}
      {isSeller && (
        <div className="mb-8">
          {isBuyer && (
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Selling
            </h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link href="/dashboard/consignments">
              <Card className="hover:border-champagne/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <Package className="h-5 w-5 text-champagne" />
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base">Consignments</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Track consigned items and status</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/dashboard/documents">
              <Card className="hover:border-champagne/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <ScrollText className="h-5 w-5 text-champagne" />
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base">Documents</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Agreements and statements</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/payouts">
              <Card className="hover:border-champagne/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <DollarSign className="h-5 w-5 text-champagne" />
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base">Payouts</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Commission and payout history</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

      {/* Quick Action */}
      <div className="flex gap-3">
        {isBuyer && (
          <Link href="/auctions">
            <Button variant="outline" className="gap-2">
              Browse Auctions
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
        {isSeller && (
          <Link href="/consign">
            <Button variant="outline" className="gap-2">
              Submit an Item
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
