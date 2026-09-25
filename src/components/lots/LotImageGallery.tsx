'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LotLightbox } from './LotLightbox';

interface GalleryImage {
  url: string;
  alt: string;
}

interface LotImageGalleryProps {
  images: GalleryImage[];
  /** Extra classes for the hero frame (e.g. rounded-lg vs rounded-xl). */
  heroClassName?: string;
}

// Marks the history entry pushed when the viewer opens, so Back (or an iOS
// edge swipe) closes the viewer instead of leaving the lot.
const HISTORY_KEY = 'lotLightbox';

/**
 * Touch-first lot image gallery: the hero is a native snap-scroll carousel
 * (swipe on phones, chevrons on desktop), thumbnails jump to a slide, and
 * tapping the hero opens a full-screen viewer with pinch / double-tap zoom.
 */
export function LotImageGallery({ images, heroClassName = 'rounded-lg' }: LotImageGalleryProps) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  // Set by the first close request until its popstate lands: history.back()
  // is asynchronous, and a second one (double tap on ✕, a repeated Escape,
  // a swipe-down then a tap) would leave the lot page.
  const closingRef = useRef(false);

  const count = images.length;

  const indexFromScroll = (el: HTMLDivElement) =>
    Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));

  const goTo = useCallback((i: number, behavior: ScrollBehavior = 'smooth') => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior });
    setIndex(i);
  }, []);

  const openLightbox = () => {
    closingRef.current = false;
    // Pushed from the tap itself (not an effect) so StrictMode can't double it.
    // Next's patched pushState keeps its router state on the new entry.
    window.history.pushState({ [HISTORY_KEY]: true }, '');
    setLightboxOpen(true);
  };

  // Back / edge-swipe pops our entry: close. The hero follows the viewer.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onPop = () => {
      closingRef.current = false;
      setLightboxOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      closingRef.current = false;
    };
  }, [lightboxOpen]);

  // ✕ / Escape / swipe-down: unwind our history entry (its popstate closes
  // the viewer); close directly if the entry is somehow no longer ours. Only
  // the first request goes Back; the rest wait for its popstate.
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (window.history.state?.[HISTORY_KEY]) {
      closingRef.current = true;
      window.history.back();
    } else {
      setLightboxOpen(false);
    }
  }, []);

  // Land the hero on whichever image the viewer ended on.
  const onLightboxIndex = useCallback((i: number) => goTo(i, 'instant'), [goTo]);

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
              onClick={openLightbox}
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

      {lightboxOpen && (
        <LotLightbox images={images} index={index} onIndexChange={onLightboxIndex} onRequestClose={requestClose} />
      )}
    </div>
  );
}
