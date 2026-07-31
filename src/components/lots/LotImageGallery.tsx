'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface GalleryImage {
  url: string;
  alt: string;
}

interface LotImageGalleryProps {
  images: GalleryImage[];
  /** Extra classes for the hero frame (e.g. rounded-lg vs rounded-xl). */
  heroClassName?: string;
}

/**
 * Touch-first lot image gallery: the hero is a native snap-scroll carousel
 * (swipe on phones, chevrons on desktop), thumbnails jump to a slide, and
 * tapping the hero opens a full-screen lightbox with double-tap zoom.
 */
export function LotImageGallery({ images, heroClassName = 'rounded-lg' }: LotImageGalleryProps) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const lightboxTrackRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef(0);

  const count = images.length;

  const indexFromScroll = (el: HTMLDivElement) =>
    Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));

  const goTo = useCallback((i: number, behavior: ScrollBehavior = 'smooth') => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior });
    setIndex(i);
  }, []);

  // Position the lightbox track on the active slide when it opens.
  useEffect(() => {
    if (!lightboxOpen) return;
    const el = lightboxTrackRef.current;
    if (el) el.scrollTo({ left: index * el.clientWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen]);

  // Body scroll lock + Escape while the lightbox is open.
  useEffect(() => {
    if (!lightboxOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [lightboxOpen]);

  // Double-tap (or double-click) toggles zoom inside the lightbox. iOS Safari's
  // dblclick is unreliable inside scroll containers, so detect it manually.
  const handleLightboxTap = () => {
    const now = performance.now();
    if (now - lastTapRef.current < 300) {
      setZoomed((z) => !z);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setZoomed(false);
  };

  if (count === 0) return null;

  return (
    <div className="space-y-4">
      {/* Hero carousel */}
      <div className={`relative aspect-[4/3] bg-muted overflow-hidden ${heroClassName}`}>
        <div
          ref={trackRef}
          onScroll={(e) => setIndex(indexFromScroll(e.currentTarget))}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scrollbar-hide"
        >
          {images.map((img, i) => (
            <button
              key={img.url + i}
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={`View image ${i + 1} of ${count} full screen`}
              className="relative h-full w-full shrink-0 snap-center cursor-zoom-in"
            >
              <Image
                src={img.url}
                alt={img.alt}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 66vw"
                priority={i === 0}
              />
            </button>
          ))}
        </div>

        {count > 1 && (
          <>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white tabular-nums pointer-events-none">
              {index + 1} / {count}
            </span>
            {/* Desktop chevrons — phones swipe natively */}
            <button
              type="button"
              onClick={() => goTo(Math.max(0, index - 1))}
              aria-label="Previous image"
              disabled={index === 0}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-background/80 shadow-sm transition-opacity hover:bg-background disabled:opacity-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => goTo(Math.min(count - 1, index + 1))}
              aria-label="Next image"
              disabled={index === count - 1}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-background/80 shadow-sm transition-opacity hover:bg-background disabled:opacity-0"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 py-1">
          {images.map((img, i) => (
            <button
              key={img.url + i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to image ${i + 1}`}
              aria-current={i === index}
              className={`relative h-16 w-16 shrink-0 rounded bg-muted overflow-hidden transition-shadow ${
                i === index ? 'ring-2 ring-champagne' : 'ring-1 ring-border/50'
              }`}
            >
              <Image src={img.url} alt={img.alt} fill className="object-cover" sizes="64px" />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label="Image viewer">
          <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <span className="text-sm text-white/80 tabular-nums">
              {index + 1} / {count}
            </span>
            <button
              type="button"
              onClick={closeLightbox}
              aria-label="Close image viewer"
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/90 hover:bg-white/10 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {zoomed ? (
            <div className="flex-1 overflow-auto overscroll-contain" onClick={handleLightboxTap}>
              <div className="relative h-[200%] w-[200%]">
                <Image src={images[index].url} alt={images[index].alt} fill className="object-contain" sizes="200vw" />
              </div>
            </div>
          ) : (
            <div
              ref={lightboxTrackRef}
              onScroll={(e) => setIndex(indexFromScroll(e.currentTarget))}
              onClick={handleLightboxTap}
              className="flex-1 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden scrollbar-hide"
            >
              {images.map((img, i) => (
                <div key={img.url + i} className="relative h-full w-full shrink-0 snap-center">
                  <Image src={img.url} alt={img.alt} fill className="object-contain" sizes="100vw" />
                </div>
              ))}
            </div>
          )}

          <p className="pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-xs text-white/50">
            {zoomed ? 'Drag to pan — double-tap to zoom out' : 'Double-tap to zoom'}
          </p>
        </div>
      )}
    </div>
  );
}
