'use client';

import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Chrome / Android
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari detection
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setShowIOSPrompt(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (dismissed) return null;
  if (!deferredPrompt && !showIOSPrompt) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      setDismissed(true);
    }
  };

  return (
    <div className="mx-4 mt-6 p-4 rounded-2xl bg-[#272D35] text-white relative">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#D4C5A0]/20 flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-[#D4C5A0]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm">Add to Home Screen</h3>
          {showIOSPrompt && !deferredPrompt ? (
            <p className="text-xs text-white/60 mt-1 leading-relaxed">
              Tap <Share className="w-3 h-3 inline" /> then &quot;Add to Home Screen&quot; for quick access next time.
            </p>
          ) : (
            <>
              <p className="text-xs text-white/60 mt-1">
                Install for quick access to upload items anytime.
              </p>
              <button
                type="button"
                onClick={handleInstall}
                className="mt-2.5 px-4 py-2 bg-[#D4C5A0] text-[#272D35] text-xs font-medium rounded-lg active:scale-[0.97] transition-transform"
              >
                Install App
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
