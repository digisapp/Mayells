'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight, Camera, X } from 'lucide-react';
import { toast } from 'sonner';

export function HeroAppraisalForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', items: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.heic'));
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
      formData.append('email', form.email);
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
    <div className="bg-white/[0.04] border border-white/10 rounded-xl sm:rounded-2xl p-5 sm:p-7">
      {submitted ? (
        <div className="text-center py-6">
          <CheckCircle className="h-10 w-10 text-champagne mx-auto mb-3" />
          <h3 className="font-display text-lg mb-1">Request Received</h3>
          <p className="text-white/60 text-sm">
            A specialist will contact you within 24 hours.
          </p>
        </div>
      ) : (
        <>
          <h3 className="font-display text-lg mb-5">Request a Free Appraisal</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Your Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
              />
              <input
                type="tel"
                placeholder="Phone"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
              />
            </div>
            <textarea
              placeholder="What items do you have?"
              rows={2}
              value={form.items}
              onChange={(e) => setForm({ ...form, items: e.target.value })}
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors resize-none"
            />

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
                <div className="flex gap-2 mb-2 flex-wrap">
                  {photoPreviews.map((src, i) => (
                    <div key={i} className="relative group">
                      <img src={src} alt={`Photo ${i + 1}`} className="h-12 w-12 object-cover rounded-lg border border-white/10" />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 bg-white/[0.06] border border-dashed border-white/20 hover:border-champagne/40 rounded-lg px-4 py-2.5 text-sm text-white/50 hover:text-white/70 transition-colors"
              >
                <Camera className="h-4 w-4" />
                {photos.length > 0 ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} — add more` : 'Upload photos (optional)'}
              </button>
            </div>

            <Button type="submit" variant="champagne" size="lg" className="w-full" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Get Free Appraisal'}
              {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
            <p className="text-[10px] text-white/30 text-center">
              No obligation. Completely confidential.
            </p>
          </form>
        </>
      )}
    </div>
  );
}
