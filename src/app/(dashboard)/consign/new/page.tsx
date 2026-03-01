'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function NewConsignmentPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
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
        router.push('/consign');
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
    <div className="max-w-2xl">
      <h1 className="font-display text-display-sm mb-8">Submit for Consignment</h1>

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
                Your best estimate of the item&apos;s value. Our team will provide an official appraisal.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !categorySlug}
            className="bg-champagne text-charcoal hover:bg-champagne/90"
          >
            {submitting ? 'Submitting...' : 'Submit for Review'}
          </Button>
        </div>
      </form>
    </div>
  );
}
