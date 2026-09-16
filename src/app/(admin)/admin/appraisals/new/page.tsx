'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PhotoUploadPanel } from '../_components/PhotoUploadPanel';

export default function NewAppraisalPage() {
  const router = useRouter();
  const [step, setStep] = useState<'info' | 'upload'>('info');
  const [visitId, setVisitId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Client info
  const [form, setForm] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    clientAddress: '',
    clientCity: '',
    clientState: '',
    visitDate: '',
    notes: '',
  });

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/appraisals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create appraisal');
      setVisitId(json.data.id);
      setStep('upload');
      toast.success('Visit created — now upload photos');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create appraisal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-display-sm mb-6">New Estate Appraisal</h1>

      {step === 'info' && (
        <form onSubmit={handleCreateVisit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name *</Label>
                <Input
                  id="clientName"
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  placeholder="e.g. Jane Doe"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Email</Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    value={form.clientEmail}
                    onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                    placeholder="jane@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientPhone">Phone</Label>
                  <Input
                    id="clientPhone"
                    type="tel"
                    value={form.clientPhone}
                    onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientAddress">Address</Label>
                <Input
                  id="clientAddress"
                  value={form.clientAddress}
                  onChange={(e) => setForm({ ...form, clientAddress: e.target.value })}
                  placeholder="123 Palm Beach Dr"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientCity">City</Label>
                  <Input
                    id="clientCity"
                    value={form.clientCity}
                    onChange={(e) => setForm({ ...form, clientCity: e.target.value })}
                    placeholder="Palm Beach"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientState">State</Label>
                  <Input
                    id="clientState"
                    value={form.clientState}
                    onChange={(e) => setForm({ ...form, clientState: e.target.value })}
                    placeholder="FL"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="visitDate">Visit Date</Label>
                <Input
                  id="visitDate"
                  type="date"
                  value={form.visitDate}
                  onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any notes about the visit or collection..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
          <Button
            type="submit"
            disabled={submitting || !form.clientName}
            className="w-full bg-champagne text-charcoal hover:bg-champagne/90"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            {submitting ? 'Creating...' : 'Continue to Photo Upload'}
          </Button>
        </form>
      )}

      {step === 'upload' && visitId && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Upload Item Photos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload one photo per item. Each photo is analyzed by AI to generate a
                title, description, condition, and price estimate. Analysis starts on the
                visit page as soon as the upload finishes.
              </p>
              <PhotoUploadPanel
                visitId={visitId}
                ctaLabel="Upload & Start AI Analysis"
                // Navigate straight away; the detail page kicks off (and polls)
                // the AI batches, so the admin isn't stuck here for a minute.
                onComplete={() => router.push(`/admin/appraisals/${visitId}`)}
              />
            </CardContent>
          </Card>
          <p className="text-center text-xs text-muted-foreground">
            No photos yet?{' '}
            <Link href={`/admin/appraisals/${visitId}`} className="underline hover:text-foreground">
              Open the visit
            </Link>{' '}
            — you can add photos there any time.
          </p>
        </div>
      )}
    </div>
  );
}
