import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Globe, Zap, ExternalLink } from 'lucide-react';

export function WebTrafficCard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <Card className="md:col-span-2 border-champagne/30 bg-gradient-to-br from-charcoal/[0.02] to-champagne/[0.04]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-champagne" />
            <CardTitle>Web Traffic</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Vercel Analytics is active and tracking visitors, page views, referrers, and geographic data across your site.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">
              <Button className="gap-2">
                <BarChart3 className="h-4 w-4" />
                View Traffic Dashboard
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
            <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="gap-2">
                <Zap className="h-4 w-4" />
                Speed Insights
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tracking Active</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm">Page Views</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm">Visitor Analytics</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm">Core Web Vitals</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm">Speed Insights</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
