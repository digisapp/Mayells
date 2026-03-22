'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Upload, Plus, X, Check, Loader2, ImagePlus } from 'lucide-react';

interface UploadItem {
  images: string[];
  sellerTitle: string;
  sellerNotes: string;
}

interface LinkData {
  prospectName: string;
  maxItems: number | null;
  itemCount: number;
}

type PageState = 'loading' | 'invalid' | 'ready' | 'submitting' | 'success';

export default function UploadPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [items, setItems] = useState<UploadItem[]>([
    { images: [], sellerTitle: '', sellerNotes: '' },
  ]);
  const [submittedCount, setSubmittedCount] = useState(0);

  useEffect(() => {
    async function validateToken() {
      try {
        const res = await fetch(`/api/upload/${token}`);
        if (!res.ok) {
          setState('invalid');
          return;
        }
        const data = await res.json();
        setLinkData(data);
        setState('ready');
      } catch {
        setState('invalid');
      }
    }
    validateToken();
  }, [token]);

  function addItem() {
    if (linkData?.maxItems !== null && linkData?.maxItems !== undefined) {
      const remaining = linkData.maxItems - linkData.itemCount;
      if (items.length >= remaining) return;
    }
    setItems([...items, { images: [], sellerTitle: '', sellerNotes: '' }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof UploadItem, value: string | string[]) {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function addImageUrl(index: number) {
    const updated = [...items];
    updated[index] = { ...updated[index], images: [...updated[index].images, ''] };
    setItems(updated);
  }

  function updateImageUrl(itemIndex: number, imageIndex: number, url: string) {
    const updated = [...items];
    const images = [...updated[itemIndex].images];
    images[imageIndex] = url;
    updated[itemIndex] = { ...updated[itemIndex], images };
    setItems(updated);
  }

  function removeImageUrl(itemIndex: number, imageIndex: number) {
    const updated = [...items];
    const images = updated[itemIndex].images.filter((_, i) => i !== imageIndex);
    updated[itemIndex] = { ...updated[itemIndex], images };
    setItems(updated);
  }

  async function handleSubmit() {
    const validItems = items.filter((item) => item.images.some((url) => url.trim() !== ''));
    if (validItems.length === 0) return;

    setState('submitting');
    try {
      const payload = validItems.map((item) => ({
        images: item.images.filter((url) => url.trim() !== ''),
        sellerTitle: item.sellerTitle.trim() || undefined,
        sellerNotes: item.sellerNotes.trim() || undefined,
      }));

      const res = await fetch(`/api/upload/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMessage(data.error || 'Something went wrong. Please try again.');
        setState('ready');
        return;
      }

      setSubmittedCount(validItems.length);
      setState('success');
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
      setState('ready');
    }
  }

  const validItemCount = items.filter((item) => item.images.some((url) => url.trim() !== '')).length;
  const remaining =
    linkData?.maxItems !== null && linkData?.maxItems !== undefined
      ? linkData.maxItems - linkData.itemCount
      : null;

  // ── Loading ──────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#D4C5A0] mx-auto mb-4" />
          <p className="text-[#272D35]/60 text-sm tracking-wide">Validating your link...</p>
        </div>
      </div>
    );
  }

  // ── Invalid ──────────────────────────────────────────────
  if (state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8] px-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-[#272D35]/5 flex items-center justify-center mx-auto mb-6">
            <X className="h-8 w-8 text-[#272D35]/40" />
          </div>
          <h1 className="font-serif text-2xl text-[#272D35] mb-3">Link Unavailable</h1>
          <p className="text-[#272D35]/60 leading-relaxed">
            This upload link is invalid or has expired. Please contact Mayell for a new link.
          </p>
        </div>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8] px-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-[#D4C5A0]/20 flex items-center justify-center mx-auto mb-6">
            <Check className="h-8 w-8 text-[#D4C5A0]" />
          </div>
          <h1 className="font-serif text-2xl text-[#272D35] mb-3">Thank You</h1>
          <p className="text-[#272D35]/60 leading-relaxed">
            We&apos;ve received your {submittedCount} {submittedCount === 1 ? 'item' : 'items'}. Our
            team will review them and reach out within 1&ndash;2 business days.
          </p>
        </div>
      </div>
    );
  }

  // ── Ready / Submitting ───────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Header */}
      <header className="border-b border-[#272D35]/10 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-8 text-center">
          <p className="text-xs tracking-[0.35em] uppercase text-[#D4C5A0] font-medium mb-6">
            MAYELL
          </p>
          <h1 className="font-serif text-3xl text-[#272D35] mb-3 flex items-center justify-center gap-3">
            <Upload className="h-7 w-7 text-[#D4C5A0]" />
            Upload Your Items
          </h1>
          <p className="text-[#272D35]/60 leading-relaxed">
            Hello {linkData?.prospectName}, please upload photos of items you&apos;d like to
            consign.
          </p>
          {remaining !== null && (
            <p className="text-sm text-[#D4C5A0] mt-2">
              {remaining} {remaining === 1 ? 'item' : 'items'} remaining
            </p>
          )}
        </div>
      </header>

      {/* Items */}
      <main className="max-w-3xl mx-auto px-4 py-10">
        {errorMessage && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {errorMessage}
          </div>
        )}

        <div className="space-y-6">
          {items.map((item, itemIndex) => (
            <div
              key={itemIndex}
              className="bg-white rounded-xl border border-[#272D35]/10 p-6 relative"
            >
              {/* Remove button */}
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(itemIndex)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-[#272D35]/30 hover:text-[#272D35]/70 hover:bg-[#272D35]/5 transition-colors"
                  aria-label="Remove item"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <p className="text-xs tracking-[0.2em] uppercase text-[#272D35]/40 mb-5">
                Item {itemIndex + 1}
              </p>

              {/* Image URLs */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-[#272D35] mb-2">
                  Image URLs
                </label>
                <div className="space-y-2">
                  {item.images.map((url, imgIndex) => (
                    <div key={imgIndex} className="flex gap-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => updateImageUrl(itemIndex, imgIndex, e.target.value)}
                        placeholder="https://example.com/photo.jpg"
                        className="flex-1 px-3 py-2 text-sm border border-[#272D35]/15 rounded-lg bg-white text-[#272D35] placeholder:text-[#272D35]/30 focus:outline-none focus:ring-2 focus:ring-[#D4C5A0]/50 focus:border-[#D4C5A0] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => removeImageUrl(itemIndex, imgIndex)}
                        className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg text-[#272D35]/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                        aria-label="Remove image URL"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => addImageUrl(itemIndex)}
                  className="mt-2 flex items-center gap-2 text-sm text-[#D4C5A0] hover:text-[#c4b590] transition-colors"
                >
                  <ImagePlus className="h-4 w-4" />
                  Add image URL
                </button>
              </div>

              {/* Title */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-[#272D35] mb-1.5">
                  What is this item?
                  <span className="text-[#272D35]/30 font-normal ml-1.5">optional</span>
                </label>
                <input
                  type="text"
                  value={item.sellerTitle}
                  onChange={(e) => updateItem(itemIndex, 'sellerTitle', e.target.value)}
                  placeholder="e.g., Victorian mahogany writing desk"
                  className="w-full px-3 py-2 text-sm border border-[#272D35]/15 rounded-lg bg-white text-[#272D35] placeholder:text-[#272D35]/30 focus:outline-none focus:ring-2 focus:ring-[#D4C5A0]/50 focus:border-[#D4C5A0] transition-colors"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-[#272D35] mb-1.5">
                  Any details about this item?
                  <span className="text-[#272D35]/30 font-normal ml-1.5">optional</span>
                </label>
                <textarea
                  value={item.sellerNotes}
                  onChange={(e) => updateItem(itemIndex, 'sellerNotes', e.target.value)}
                  placeholder="History, condition, provenance, dimensions..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-[#272D35]/15 rounded-lg bg-white text-[#272D35] placeholder:text-[#272D35]/30 focus:outline-none focus:ring-2 focus:ring-[#D4C5A0]/50 focus:border-[#D4C5A0] transition-colors resize-none"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Add Item Button */}
        <button
          type="button"
          onClick={addItem}
          disabled={remaining !== null && items.length >= remaining}
          className="mt-6 w-full py-3 rounded-xl border-2 border-dashed border-[#272D35]/15 text-[#272D35]/50 hover:border-[#D4C5A0] hover:text-[#D4C5A0] transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
          Add Item
        </button>

        {/* Submit */}
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={state === 'submitting' || validItemCount === 0}
            className="inline-flex items-center justify-center gap-2.5 px-10 py-3.5 bg-[#272D35] text-white text-sm font-medium tracking-wide rounded-lg hover:bg-[#1e2329] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === 'submitting' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Submit {validItemCount} {validItemCount === 1 ? 'Item' : 'Items'}
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
