'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff, Image as ImageIcon } from 'lucide-react';

interface SandboxedEmailProps {
  html: string;
  className?: string;
}

const REMOTE_IMG_ATTR = /(<img\b[^>]*?)\s(src|srcset)\s*=\s*(["']?)(https?:)/gi;
const HAS_REMOTE_IMAGE = /<img\b[^>]*\s(src|srcset)\s*=\s*["']?https?:|url\(\s*["']?https?:/i;

/**
 * Renders HTML email content inside a sandboxed iframe to prevent XSS.
 *
 * Defence in depth:
 *  - the sandbox attribute disables scripts, forms, and same-frame navigation
 *    (popups are allowed so links can open in a new tab, and escape the
 *    sandbox so that tab is a normal page);
 *  - a `default-src 'none'` CSP inside the document blocks every fetch except
 *    inline styles and data:/cid: images — remote (https:) images are only
 *    permitted after the operator clicks "Load images", which is also what
 *    stops tracking pixels firing on open;
 *  - `<base target="_blank">` makes every link leave the admin frame.
 */
export function SandboxedEmail({ html, className }: SandboxedEmailProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  // The opt-in is keyed to the message, so a new message is blocked from its
  // very first render (no transient frame where the previous choice applies).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loadImages = loadedFor === html;

  const hasRemoteImages = useMemo(() => HAS_REMOTE_IMAGE.test(html), [html]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    // Until the operator opts in, remote image references are renamed so the
    // browser never even attempts them (and the CSP is the backstop).
    const body = loadImages ? html : html.replace(REMOTE_IMG_ATTR, '$1 data-$2=$3$4');
    const imgSrc = loadImages ? "data: cid: https:" : 'data: cid:';

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'">
          <base target="_blank">
          <style>
            body {
              font-family: Georgia, serif;
              font-size: 14px;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background: transparent;
              overflow-y: hidden;
            }
            img { max-width: 100%; height: auto; }
            img[data-src] { min-width: 24px; min-height: 24px; background: #eee; }
            a { color: #D4C5A0; }
            table { max-width: 100%; }
          </style>
        </head>
        <body>${body}</body>
      </html>
    `);
    doc.close();

    // Auto-resize iframe to fit content; when content exceeds the 600px cap,
    // let the iframe body scroll internally instead of clipping.
    const resize = () => {
      if (doc.body) {
        const contentHeight = doc.body.scrollHeight + 16;
        const capped = contentHeight > 600;
        doc.body.style.overflowY = capped ? 'auto' : 'hidden';
        setHeight(capped ? 600 : contentHeight);
      }
    };

    // Resize again once images settle; listeners are tracked so they're
    // removed when the message changes or the component unmounts.
    const images = Array.from(doc.querySelectorAll('img'));
    const listeners: Array<{ el: HTMLImageElement; handler: () => void }> = [];
    let pending = 0;
    const settle = () => {
      pending--;
      if (pending <= 0) resize();
    };
    for (const img of images) {
      if (img.complete) continue;
      pending++;
      img.addEventListener('load', settle);
      img.addEventListener('error', settle);
      listeners.push({ el: img, handler: settle });
    }

    const raf = requestAnimationFrame(resize);

    return () => {
      cancelAnimationFrame(raf);
      for (const { el, handler } of listeners) {
        el.removeEventListener('load', handler);
        el.removeEventListener('error', handler);
      }
    };
  }, [html, loadImages]);

  return (
    <div className={className}>
      {hasRemoteImages && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {loadImages ? <ImageIcon className="h-3.5 w-3.5" /> : <ImageOff className="h-3.5 w-3.5" />}
            {loadImages ? 'Remote images loaded' : 'Remote images are blocked'}
          </span>
          <button
            type="button"
            onClick={() => setLoadedFor(loadImages ? null : html)}
            className="font-medium text-foreground hover:underline"
          >
            {loadImages ? 'Block images' : 'Load images'}
          </button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        style={{
          width: '100%',
          height: `${height}px`,
          border: 'none',
          overflow: 'hidden',
          display: 'block',
        }}
        title="Email content"
      />
    </div>
  );
}
