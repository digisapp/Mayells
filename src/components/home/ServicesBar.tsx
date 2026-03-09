'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, CheckCircle, ArrowRight, MessageCircle, Camera, X } from 'lucide-react';
import { toast } from 'sonner';
import { BUSINESS } from '@/lib/config';

export function ServicesBar() {
  const [form, setForm] = useState({ name: '', phone: '', items: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
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
      formData.append('items', form.items);
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
    <section className="bg-charcoal text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          <div>
            <h2 className="font-display text-display-md sm:text-display-lg leading-tight">
              Free Appraisals &<br />
              <span className="text-champagne">Estate Evaluations</span>
            </h2>
            <p className="mt-4 text-white/60 text-[15px] leading-relaxed max-w-md">
              Thinking of selling? Our specialists provide complimentary appraisals for
              art, antiques, jewelry, watches, fashion, and design. Walk-ins welcome.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4 sm:gap-6 max-w-md">
              {[
                { label: 'We Buy', desc: 'Immediate offers' },
                { label: 'We Sell', desc: 'Auction or gallery' },
                { label: 'Consign', desc: 'Earn top dollar' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="font-display text-lg sm:text-xl text-champagne">{s.label}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <a
                href={BUSINESS.phoneHref}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg px-4 sm:px-5 py-3 transition-colors"
              >
                <Phone className="h-4 w-4 text-champagne" />
                <span className="font-semibold text-sm">{BUSINESS.phone}</span>
              </a>
              <span className="text-[12px] text-white/40">Call or text anytime</span>
            </div>
          </div>

          <div className="bg-white/[0.04] border border-white/10 rounded-xl sm:rounded-2xl p-5 sm:p-8">
            {submitted ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-champagne mx-auto mb-4" />
                <h3 className="font-display text-xl mb-2">Request Received</h3>
                <p className="text-white/60 text-sm">
                  A specialist will contact you within 24 hours.
                </p>
              </div>
            ) : (
              <>
                <h3 className="font-display text-xl mb-1">Request a Free Appraisal</h3>
                <p className="text-[13px] text-white/50 mb-6">
                  Tell us what you have — we&apos;ll get back to you within 24 hours.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <input
                    type="text"
                    placeholder="Your Name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
                  />
                  <textarea
                    placeholder="What items do you have? (e.g., jewelry collection, estate furniture, art collection...)"
                    rows={3}
                    value={form.items}
                    onChange={(e) => setForm({ ...form, items: e.target.value })}
                    className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors resize-none"
                  />

                  {/* Photo Upload */}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
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
                      {photos.length > 0 ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} — add more` : 'Upload photos (optional)'}
                    </button>
                  </div>

                  <Button type="submit" variant="champagne" size="lg" className="w-full" disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Get My Free Appraisal'}
                    {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
                  </Button>
                  <p className="text-[11px] text-white/30 text-center">
                    No obligation. Completely confidential.
                  </p>
                </form>

                <div className="flex items-center gap-3 mt-5">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[11px] text-white/30 uppercase tracking-widest">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-chat', { detail: { message: 'I\'d like a free appraisal for my items' } }))}
                  className="mt-4 w-full flex items-center justify-center gap-2.5 bg-champagne/10 hover:bg-champagne/20 border border-champagne/30 text-champagne rounded-xl px-5 py-3.5 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Chat with a Specialist</span>
                </button>
                <p className="text-[11px] text-white/30 text-center mt-2">
                  Get an instant assessment — upload photos for best results
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
