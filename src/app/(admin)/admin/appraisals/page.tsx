export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { estateVisits } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ClipboardCheck } from 'lucide-react';
import { formatCurrency } from '@/types';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  uploading: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  review: 'bg-orange-100 text-orange-700',
  sent: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
};

export default async function AppraisalsPage() {
  const visits = await db
    .select()
    .from(estateVisits)
    .orderBy(desc(estateVisits.createdAt))
    .limit(200);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-display-sm">Estate Appraisals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            In-person appraisals with AI-powered analysis
          </p>
        </div>
        <Link href="/admin/appraisals/new">
          <Button className="bg-champagne text-charcoal hover:bg-champagne/90">
            <Plus className="h-4 w-4 mr-2" />
            New Appraisal
          </Button>
        </Link>
      </div>

      {visits.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="font-display text-lg mb-2">No appraisals yet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first estate appraisal to get started.
            </p>
            <Link href="/admin/appraisals/new">
              <Button className="bg-champagne text-charcoal hover:bg-champagne/90">
                <Plus className="h-4 w-4 mr-2" />
                New Appraisal
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {visits.length} appraisal{visits.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Client</th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Location</th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-center px-6 py-3 font-medium text-muted-foreground">Items</th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Estimate</th>
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((visit) => (
                    <tr key={visit.id} className="border-b last:border-0 hover:bg-accent/5">
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/appraisals/${visit.id}`}
                          className="font-medium hover:text-champagne transition-colors"
                        >
                          {visit.clientName}
                        </Link>
                        {visit.clientEmail && (
                          <p className="text-xs text-muted-foreground">{visit.clientEmail}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {[visit.clientCity, visit.clientState].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {visit.visitDate
                          ? new Date(visit.visitDate).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {visit.processedCount}/{visit.itemCount}
                      </td>
                      <td className="px-6 py-4">
                        {visit.totalEstimateHigh > 0
                          ? `${formatCurrency(visit.totalEstimateLow)} – ${formatCurrency(visit.totalEstimateHigh)}`
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className={statusColors[visit.status] || ''}>
                          {visit.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
