'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { RotateCcw, Phone } from 'lucide-react';
import { UploadHeader } from '@/components/upload/UploadHeader';
import { BUSINESS } from '@/lib/config';
import { logger } from '@/lib/logger';

/**
 * If the upload page itself breaks, keep the seller in this flow's quiet
 * chrome and offer a reload: finished uploads are saved on the phone and come
 * back when the page opens again.
 */
export default function UploadError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    logger.error('Upload page error', error, { digest: error.digest });
    Sentry.captureException(error);
  }, [error]);

  return (
    <>
      <UploadHeader />
      <div className="px-5 pt-16 pb-10">
        <div className="max-w-md mx-auto text-center">
          <h1 className="font-display text-2xl mb-3">Something went wrong</h1>
          <p className="text-charcoal/65 leading-relaxed">
            Your photos that already finished uploading are safe. Reload the page to carry on.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-charcoal text-white text-[15px] font-medium"
            >
              <RotateCcw className="h-4 w-4" />
              Reload
            </button>
            <a
              href={BUSINESS.phoneHref}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-charcoal/15 text-[15px] font-medium"
            >
              <Phone className="h-4 w-4" />
              {BUSINESS.phone}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
