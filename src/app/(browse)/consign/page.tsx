'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  CheckCircle,
  Camera,
  ArrowRight,
  Phone,
  X,
  MessageCircle,
} from 'lucide-react';
import { BUSINESS } from '@/lib/config';

const steps = [
  {
    num: '01',
    title: 'Submit Online or Schedule a Visit',
    desc: 'Upload photos below or schedule a free in-person appraisal. Our team serves South Florida and New York City.',
  },
  {
    num: '02',
    title: 'Free Appraisal & Pickup',
    desc: 'We come to you for complimentary appraisals and item pickup — or handle full estate cleanouts, same day if needed.',
  },
  {
    num: '03',
    title: 'Choose Your Path',
    desc: 'We recommend the best sale method — live online auction, gallery, or private sale — based on your item and goals.',
  },
  {
    num: '04',
    title: 'We Handle Everything',
    desc: 'Professional photography, cataloging, marketing, and secure handling. You get paid when your item sells.',
  },
];


export default function ConsignPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', items: '' });
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function compressImage(file: File, maxDim = 2000, quality = 0.8): Promise<File> {
    return new Promise((resolve) => {
      if (file.size <= 500 * 1024) { resolve(file); return; }
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality,
        );
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.heic'));
    if (photos.length + imageFiles.length > 50) {
      toast.error('Maximum 50 photos allowed');
      return;
    }
    const compressed = await Promise.all(imageFiles.map((f) => compressImage(f)));
    setPhotos((prev) => [...prev, ...compressed]);
    compressed.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('phone', form.phone);
      formData.append('email', form.email);
      formData.append('items', form.items);
      formData.append('service', 'Consignment');
      photos.forEach((photo) => formData.append('photos', photo));

      const res = await fetch('/api/appraisal-requests', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        toast.error('Failed to submit. Please try again.');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="bg-charcoal text-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Sell With Us</span>
          <h1 className="font-display text-display-lg mt-3 mb-5">Consign Your Pieces</h1>
          <p className="text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
            Whether it&apos;s a single heirloom or an entire estate, our team in Boca Raton and Tribeca, NYC
            will come to you for free appraisals, item pickup, and same-day estate cleanouts.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="#submit-form">
              <Button variant="champagne" size="lg">
                Submit an Item
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
            <a
              href={BUSINESS.phoneHref}
              className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
            >
              <Phone className="h-4 w-4" />
              {BUSINESS.phone}
            </a>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="font-display text-display-sm text-center mb-12">How Consignment Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div key={step.num} className="text-center">
              <span className="text-3xl font-display text-champagne">{step.num}</span>
              <h3 className="font-medium text-sm mt-2 mb-1">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Mayell vs Big Auction Houses */}
      <section className="bg-ivory">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="font-display text-display-sm text-center mb-4">Why Consign With Mayell</h2>
          <p className="text-center text-muted-foreground text-sm max-w-2xl mx-auto mb-12">
            Large auction houses charge hidden fees, cherry-pick only the best items, and can take up to a year before you get paid. We do things differently.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              {
                title: 'No Hidden Fees',
                desc: 'Big auction houses charge sellers for photography, catalog printing, insurance, and storage — on top of commission. With Mayell, you pay nothing upfront. Ever.',
              },
              {
                title: 'We Take Everything',
                desc: 'Other houses cherry-pick your best pieces and leave you to deal with the rest. We take it all — from fine art to everyday household items. One call, one cleanout.',
              },
              {
                title: 'Paid in 60 Days, Not 12 Months',
                desc: 'Major houses can take 6–12 months to place your items and another 30–90 days to pay you. We list your items within 30 days and pay you within 30 days of sale.',
              },
              {
                title: 'Monthly Auctions',
                desc: 'We run auctions every month, so your items go live fast. No waiting for the "right" sale or next season — your items are listed and selling within weeks.',
              },
              {
                title: 'Free House Calls & Pickup',
                desc: 'Need your parents\u2019 house cleaned out this week? Our team in Boca Raton and Tribeca, NYC can be there same day for appraisals, pickup, and full estate cleanouts.',
              },
              {
                title: 'Simple & Fast',
                desc: 'From the day we pick up your items, you can be paid in as little as 60 days. No contracts to negotiate, no waiting lists, no surprise invoices.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl border border-black/5 p-6">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-champagne mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-base mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What We Accept */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="font-display text-display-sm text-center mb-8">What We Accept</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
          {[
            'Fine Art & Paintings',
            'Antiques & Furniture',
            'Jewelry & Watches',
            'Fashion & Accessories',
            'Collectibles & Memorabilia',
            'Design & Decorative Arts',
          ].map((item) => (
            <div
              key={item}
              className="text-center bg-charcoal/[0.03] border border-black/5 rounded-xl px-4 py-4"
            >
              <p className="text-sm font-medium">{item}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-6">
          Not sure if your item qualifies? <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-chat', { detail: { message: 'I have an item I\'d like to consign — can you help?' } }))}
            className="text-champagne hover:underline"
          >Chat with a specialist</button> or call us at{' '}
          <a href={BUSINESS.phoneHref} className="text-champagne hover:underline">{BUSINESS.phone}</a>.
        </p>
      </section>

      {/* Submission Form */}
      <section id="submit-form" className="bg-charcoal text-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {submitted ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-champagne mx-auto mb-4" />
              <h2 className="font-display text-xl mb-2">Submission Received</h2>
              <p className="text-white/60 text-sm mb-6">
                Thank you! Our team will review your consignment and contact you within 1-2 business days.
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={() => { setSubmitted(false); setForm({ name: '', email: '', phone: '', items: '' }); setPhotos([]); setPhotoPreviews([]); }}>
                  Submit Another
                </Button>
                <Link href="/">
                  <Button variant="champagne">Back to Home</Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="font-display text-display-sm text-center mb-2">Submit Your Item</h2>
              <p className="text-center text-white/50 text-sm mb-8">
                Tell us about your piece — we&apos;ll get back to you within 1-2 business days.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Your Name *"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number *"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
                  />
                </div>
                <input
                  type="email"
                  placeholder="Email Address"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
                />
                <textarea
                  placeholder="Describe your item(s): what it is, condition, provenance, dimensions, any known history..."
                  rows={4}
                  value={form.items}
                  onChange={(e) => setForm({ ...form, items: e.target.value })}
                  className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors resize-none"
                />

                {/* Photo Upload */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  {photoPreviews.length > 0 && (
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {photoPreviews.map((src, i) => (
                        <div key={i} className="relative group">
                          <img src={src} alt={`Photo ${i + 1}`} className="h-16 w-16 object-cover rounded-lg border border-white/10" />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-white/[0.06] border border-dashed border-white/20 hover:border-champagne/40 rounded-lg px-4 py-3 text-sm text-white/50 hover:text-white/70 transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    {photos.length > 0 ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} — add more` : 'Upload photos (recommended)'}
                  </button>
                </div>

                <Button type="submit" variant="champagne" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit for Review'}
                  {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                <p className="text-[11px] text-white/30 text-center">
                  No obligation. Completely confidential.
                </p>
              </form>

              <div className="flex items-center gap-3 mt-6">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] text-white/30 uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-chat', { detail: { message: 'I have an item I\'d like to consign' } }))}
                className="mt-4 w-full flex items-center justify-center gap-2.5 bg-champagne/10 hover:bg-champagne/20 border border-champagne/30 text-champagne rounded-xl px-5 py-3.5 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Chat with a Specialist</span>
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
