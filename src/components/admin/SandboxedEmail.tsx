'use client';

import { useEffect, useRef, useState } from 'react';

interface SandboxedEmailProps {
  html: string;
  className?: string;
}

/**
 * Renders HTML email content inside a sandboxed iframe to prevent XSS.
 * The iframe has no script execution, no form submission, and no navigation.
 */
export function SandboxedEmail({ html, className }: SandboxedEmailProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    // Write content with base styles
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
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
            a { color: #D4C5A0; }
            table { max-width: 100%; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    doc.close();

    // Auto-resize iframe to fit content
    const resize = () => {
      if (doc.body) {
        const contentHeight = doc.body.scrollHeight;
        setHeight(Math.min(contentHeight + 16, 600));
      }
    };

    // Resize after images load
    const images = doc.querySelectorAll('img');
    let loaded = 0;
    if (images.length === 0) {
      resize();
    } else {
      images.forEach((img) => {
        if (img.complete) {
          loaded++;
          if (loaded === images.length) resize();
        } else {
          img.addEventListener('load', () => {
            loaded++;
            if (loaded === images.length) resize();
          });
          img.addEventListener('error', () => {
            loaded++;
            if (loaded === images.length) resize();
          });
        }
      });
    }

    // Initial resize
    requestAnimationFrame(resize);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      className={className}
      style={{
        width: '100%',
        height: `${height}px`,
        border: 'none',
        overflow: 'hidden',
      }}
      title="Email content"
    />
  );
}
