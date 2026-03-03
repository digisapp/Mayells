'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { Shield, Lock, CheckCircle } from 'lucide-react';

interface InquiryPanelProps {
  lotId: string;
  title: string;
  estimateLow?: number | null;
  estimateHigh?: number | null;
}

export function InquiryPanel({ lotId, title }: InquiryPanelProps) {
  const { isAuthenticated, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: profile?.fullName || '',
    email: '',
    phone: '',
    message: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId, ...form }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to submit inquiry');
        setIsLoading(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-card border border-border/50 rounded-xl p-8 shadow-luxury sticky top-24 text-center">
        <CheckCircle className="h-10 w-10 text-champagne mx-auto mb-4" />
        <h3 className="font-display text-xl mb-2">Inquiry Submitted</h3>
        <p className="text-sm text-muted-foreground">
          Thank you for your interest in <span className="font-medium text-foreground">{title}</span>.
          A specialist will be in touch within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-6 space-y-6 shadow-luxury sticky top-24">
      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-champagne font-semibold mb-1">Private Sale</p>
        <p className="font-display text-xl">Inquire About This Work</p>
        <p className="text-sm text-muted-foreground mt-1">
          Price available upon request. Submit your inquiry and a specialist will contact you.
        </p>
      </div>

      {/* Form */}
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
            placeholder="Your full name"
          />
        </div>
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
            placeholder="your@email.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+1 (555) 000-0000"
          />
        </div>
        <div className="space-y-2">
          <Label>Message</Label>
          <Textarea
            value={form.message}
            onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
            rows={3}
            placeholder="Tell us about your interest in this work..."
          />
        </div>

        <Button variant="champagne" size="xl" className="w-full" disabled={isLoading}>
          {isLoading ? 'Submitting...' : 'Submit Inquiry'}
        </Button>
      </form>

      {/* Trust badges */}
      <div className="border-t border-border/30 pt-4 space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          <span>All inquiries are confidential</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Shield className="h-4 w-4 shrink-0" />
          <span>Authenticity guaranteed</span>
        </div>
      </div>
    </div>
  );
}
