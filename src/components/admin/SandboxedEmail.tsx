'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageOff, Image as ImageIcon } from 'lucide-react';

interface SandboxedEmailProps {
  html: string;
  className?: string;
}

const REMOTE_IMG_ATTR = /(<img\b[^>]*?)\s(src|srcset)\s*=\s*(["']?)(https?:)/gi;
const HAS_REMOTE_IMAGE = /<img\b[^>]*\s(src|srcset)\s*=\s*["']?https?:|url\(\s*["']?https?:/i;

const QUOTE_SELECTOR = '.gmail_quote, blockquote[type="cite"], #divRplyFwdMsg, .yahoo_quoted, blockquote';

/** Whitespace, a <br>, or a block with no text and no image. */
function isBlank(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return !(node.textContent || '').trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return true;
  const el = node as Element;
  if (el.id === 'quoted' || el.id === 'quoted-toggle') return false;
  if (el.tagName === 'BR') return true;
  if (el.tagName === 'IMG' || el.tagName === 'HR' || el.tagName === 'TABLE') return false;
  return !(el.textContent || '').trim() && !el.querySelector('img, hr, table');
}

function trimEmptySiblings(from: Node, direction: 'previousSibling' | 'nextSibling') {
  let node = from[direction];
  while (node && isBlank(node)) {
    const gone = node;
    node = node[direction];
    gone.parentNode?.removeChild(gone);
  }
}

/**
 * Fold the quoted history of a reply ("On …, X wrote:" and the quote under
 * it) behind a "•••" toggle. The thread above already shows those messages.
 * A message that is nothing but a quote (a bare forward) is left alone, and
 * a signature after the quote stays visible. Runs on the frame's document,
 * which the parent can reach because the sandbox keeps same-origin.
 */
function foldQuotedHistory(doc: Document, onToggle: () => void) {
  const root = doc.body;
  const quote = root.querySelector(QUOTE_SELECTOR);
  if (!quote) return;
  let start: Element = quote;
  const prev = quote.previousElementSibling;
  if (prev && /wrote:\s*$/i.test((prev.textContent || '').trim())) start = prev;
  // Gmail wraps the attribution and the quote in one container.
  const parent = start.parentElement;
  if (parent && parent !== root && parent.firstElementChild === start && parent.lastElementChild === quote) start = parent;

  const nodes: Node[] = [];
  let node: Node | null = start;
  while (node) {
    nodes.push(node);
    if (node === quote || (node as Element).contains?.(quote)) break;
    node = node.nextSibling;
  }

  const own = root.cloneNode(true) as HTMLElement;
  own.querySelector(QUOTE_SELECTOR)?.remove();
  if (!(own.textContent || '').replace(/\s+/g, '').length) return;

  const wrap = doc.createElement('div');
  wrap.id = 'quoted';
  wrap.hidden = true;
  start.parentNode?.insertBefore(wrap, start);
  for (const n of nodes) wrap.appendChild(n);

  const btn = doc.createElement('button');
  btn.id = 'quoted-toggle';
  btn.type = 'button';
  btn.textContent = '•••';
  btn.title = 'Show quoted text';
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => {
    wrap.hidden = !wrap.hidden;
    btn.title = wrap.hidden ? 'Show quoted text' : 'Hide quoted text';
    btn.setAttribute('aria-expanded', String(!wrap.hidden));
    onToggle();
  });
  wrap.parentNode?.insertBefore(btn, wrap);

  trimEmptySiblings(btn, 'previousSibling');
  trimEmptySiblings(wrap, 'nextSibling');
}

/** Mail clients end a message with a run of empty lines; drop them. */
function trimTrailingBlank(container: Node) {
  let last = container.lastChild;
  while (last) {
    if (isBlank(last)) {
      const gone = last;
      last = last.previousSibling;
      gone.parentNode?.removeChild(gone);
      continue;
    }
    if (last.nodeType === Node.ELEMENT_NODE && (last as Element).id !== 'quoted' && (last as Element).tagName !== 'IMG') trimTrailingBlank(last);
    break;
  }
}

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
/** Taller than this and the message scrolls inside its own frame. */
const MAX_HEIGHT = 900;

export function SandboxedEmail({ html, className }: SandboxedEmailProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
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
            img[width="1"], img[height="1"] { display: none !important; }
            a { color: #D4C5A0; }
            table { max-width: 100%; }
            blockquote { margin: 8px 0; padding-left: 12px; border-left: 2px solid #ddd; color: #666; }
            #quoted-toggle {
              display: block; width: fit-content; margin: 10px 0; padding: 0 10px; height: 20px; line-height: 18px;
              font-size: 12px; letter-spacing: 2px; border-radius: 999px; cursor: pointer; font-family: inherit;
              background: #f1efe8; color: #666; border: 1px solid #e5e2d9;
            }
            #quoted-toggle:hover { background: #e5e2d9; color: #333; }
            #quoted[hidden] { display: none; }
          </style>
        </head>
        <body>${body}</body>
      </html>
    `);
    doc.close();

    // Auto-resize iframe to fit content; when content exceeds the cap,
    // let the iframe body scroll internally instead of clipping.
    const resize = () => {
      if (doc.body) {
        const contentHeight = doc.body.scrollHeight + 16;
        const capped = contentHeight > MAX_HEIGHT;
        doc.body.style.overflowY = capped ? 'auto' : 'hidden';
        setHeight(capped ? MAX_HEIGHT : contentHeight);
      }
    };

    try { foldQuotedHistory(doc, resize); } catch { /* an odd DOM is shown unfolded */ }
    try { if (doc.body) trimTrailingBlank(doc.body); } catch { /* ditto */ }

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
