'use client';

import { useEffect } from 'react';

export const UNSAVED_MESSAGE = 'You have unsaved changes. Leave without saving?';

/**
 * Don't let unsaved edits vanish on the way out. `beforeunload` only covers
 * reloads, closing the tab and full-page loads; Next <Link> navigation is
 * client-side and never fires it. So while dirty, a capture-phase click
 * listener on the document sees internal link clicks (sidebar, breadcrumb,
 * in-page links) before React's Link handler does, and asks first. The
 * confirm is synchronous, which is what lets it cancel the navigation.
 */
export function useUnsavedChangesGuard(dirty: boolean, message = UNSAVED_MESSAGE) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    const onClick = (e: MouseEvent) => {
      // New-tab / new-window clicks leave this page intact.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;
      const url = new URL(anchor.href, window.location.href);
      // Other origins are full page loads, which beforeunload already covers.
      if (url.origin !== window.location.origin) return;
      // Same page (hash links) keeps the form.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, message]);
}
