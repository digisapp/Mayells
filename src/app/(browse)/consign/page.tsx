'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle, Shield, TrendingUp, Clock } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
}

const benefits = [
  { icon: TrendingUp, title: 'Maximized Returns', desc: 'Our specialists determine the optimal sale strategy for each piece' },
  { icon: Shield, title: 'Expert Handling', desc: 'Full insurance, professional photography, and secure storage' },
  { icon: Clock, title: 'Fast Turnaround', desc: 'From submission to sale in as few as 30 days' },
  { icon: CheckCircle, title: 'Free Appraisals', desc: 'Complimentary USPAP-compliant valuations for all consignments' },
];

export default function ConsignPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [categorySlug, setCategorySlug] = useState('');

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.data ?? []))
      .catch(console.error);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const estimatedValueDollars = formData.get('estimatedValue') as string;

    const body = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      categorySlug,
      estimatedValue: estimatedValueDollars ? Math.round(parseFloat(estimatedValueDollars) * 100) : undefined,
    };

    try {
      const res = await fetch('/api/consignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success('Consignment submitted for review');
        setSubmitted(true);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to submit');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-charcoal text-white py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Sell With Us</span>
          <h1 className="font-display text-display-lg mt-3 mb-5">Consign Your Pieces</h1>
          <p className="text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
            Whether it&apos;s a single heirloom or an entire estate, our team of specialists will help you
            achieve the best possible result through auction, gallery, or private sale.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {benefits.map((b) => (
            <div key={b.title} className="text-center">
              <div className="w-12 h-12 rounded-xl bg-champagne/10 flex items-center justify-center mx-auto mb-4">
                <b.icon className="h-6 w-6 text-champagne" />
              </div>
              <h3 className="font-medium text-sm mb-1">{b.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {submitted ? (
          <Card>
            <CardContent className="py-16 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h2 className="font-display text-xl mb-2">Submission Received</h2>
              <p className="text-muted-foreground mb-6">
                Thank you! Our team will review your consignment and contact you within 1-2 business days.
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => setSubmitted(false)}>
                  Submit Another
                </Button>
                <Link href="/">
                  <Button className="bg-champagne text-charcoal hover:bg-champagne/90">
                    Back to Home
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : !isAuthenticated ? (
          <Card>
            <CardContent className="py-16 text-center">
              <h2 className="font-display text-xl mb-2">Sign In to Submit</h2>
              <p className="text-muted-foreground mb-6">
                Create a free account or sign in to submit your item for consignment.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/login">
                  <Button variant="outline">Sign In</Button>
                </Link>
                <Link href="/signup">
                  <Button className="bg-champagne text-charcoal hover:bg-champagne/90">
                    Create Account
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <h2 className="font-display text-display-sm mb-6 text-center">Submit Your Item</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Item Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Item Title *</Label>
                    <Input id="title" name="title" placeholder="e.g. 19th Century Oil Painting" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Select value={categorySlug} onValueChange={setCategorySlug} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.slug} value={cat.slug}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="Describe the item: condition, provenance, dimensions, any known history..."
                      rows={5}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="estimatedValue">Estimated Value (USD)</Label>
                    <Input
                      id="estimatedValue"
                      name="estimatedValue"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 5000"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your best estimate. Our team will provide an official appraisal.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-4 justify-end">
                <Button
                  type="submit"
                  disabled={submitting || !categorySlug}
                  className="bg-champagne text-charcoal hover:bg-champagne/90"
                >
                  {submitting ? 'Submitting...' : 'Submit for Review'}
                </Button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
