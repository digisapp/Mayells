'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, ArrowRight, Upload, Loader2, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

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

  // Step 2: Photo upload
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/appraisals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to create');
      const { data } = await res.json();
      setVisitId(data.id);
      setStep('upload');
      toast.success('Visit created — now upload photos');
    } catch {
      toast.error('Failed to create appraisal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    setFiles((prev) => [...prev, ...selected]);
    selected.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setPreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAndProcess = async () => {
    if (!visitId || files.length === 0) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      const imageUrls: string[] = [];

      // Upload each file
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });
        const formData = new FormData();
        formData.append('file', files[i]);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Upload failed for file ${i + 1}`);
        const { url } = await res.json();
        imageUrls.push(url);
      }

      // Create items
      const itemsRes = await fetch(`/api/admin/appraisals/${visitId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls }),
      });
      if (!itemsRes.ok) throw new Error('Failed to create items');

      // Start processing
      await fetch(`/api/admin/appraisals/${visitId}/process`, { method: 'POST' });

      toast.success('Photos uploaded — AI analysis started');
      router.push(`/admin/appraisals/${visitId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
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
              <div className="grid grid-cols-2 gap-4">
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

      {step === 'upload' && (
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
                Upload photos of each item. Each photo will be analyzed by AI to generate
                title, description, condition, and price estimate.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {previews.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group aspect-square">
                      <img
                        src={src}
                        alt={`Item ${i + 1}`}
                        className="w-full h-full object-cover rounded-lg border"
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
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
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/20 hover:border-champagne/50 rounded-xl px-4 py-8 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Upload className="h-5 w-5" />
                {files.length > 0
                  ? `${files.length} photo${files.length !== 1 ? 's' : ''} selected — click to add more`
                  : 'Click to select photos or drag and drop'}
              </button>
            </CardContent>
          </Card>

          {uploading && (
            <Card>
              <CardContent className="py-6">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="h-5 w-5 animate-spin text-champagne" />
                  <span className="text-sm font-medium">
                    Uploading {uploadProgress.current} of {uploadProgress.total}...
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-champagne h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handleUploadAndProcess}
            disabled={files.length === 0 || uploading}
            className="w-full bg-champagne text-charcoal hover:bg-champagne/90"
            size="lg"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4 mr-2" />
                Upload {files.length} Photo{files.length !== 1 ? 's' : ''} & Start AI Analysis
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
