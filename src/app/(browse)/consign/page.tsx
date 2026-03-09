'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  CheckCircle,
  Shield,
  TrendingUp,
  Clock,
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
    title: 'Submit Your Item',
    desc: 'Fill out the form below with details about your piece. Upload photos for the fastest assessment.',
  },
  {
    num: '02',
    title: 'Free Appraisal',
    desc: 'Our specialists review your submission and provide a complimentary, no-obligation valuation within 1-2 business days.',
  },
  {
    num: '03',
    title: 'Choose Your Path',
    desc: 'We recommend the best sale method — auction, gallery, or private sale — based on your item and goals.',
  },
  {
    num: '04',
    title: 'We Handle the Rest',
    desc: 'Professional photography, cataloging, marketing, and secure handling. You get paid when your item sells.',
  },
];

const benefits = [
  { icon: TrendingUp, title: 'Maximized Returns', desc: 'Our specialists determine the optimal sale strategy for each piece' },
  { icon: Shield, title: 'Expert Handling', desc: 'Full insurance, professional photography, and secure storage' },
  { icon: Clock, title: 'Fast Turnaround', desc: 'From submission to sale in as few as 30 days' },
  { icon: CheckCircle, title: 'Free Appraisals', desc: 'Complimentary valuations for all consignments' },
];

export default function ConsignPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', items: '' });
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (photos.length + imageFiles.length > 50) {
      toast.error('Maximum 50 photos allowed');
      return;
    }
    setPhotos((prev) => [...prev, ...imageFiles]);
    imageFiles.forEach((file) => {
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
            Whether it&apos;s a single heirloom or an entire estate, our team of specialists will help you
            achieve the best possible result through auction, gallery, or private sale.
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

      {/* Benefits */}
      <section className="bg-ivory">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="font-display text-display-sm text-center mb-12">Why Consign With Mayell</h2>
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
