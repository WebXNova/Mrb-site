import { useEffect, useState } from 'react';
import { useBeforeUnloadGuard } from '../../features/test-taking/hooks/useOnlineStatus';

const DEFAULT_MESSAGE =
  'You have unsaved changes. If you leave now, your updates will be lost.';

/**
 * Warn when navigating away with unsaved form changes.
 * Uses click capture (BrowserRouter-safe) + tab close guard.
 */
export default function useUnsavedChangesGuard(isDirty, { enabled = true, message = DEFAULT_MESSAGE } = {}) {
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const active = Boolean(enabled && isDirty);

  useBeforeUnloadGuard(active, message);

  useEffect(() => {
    if (!active) {
      setPendingNavigation(null);
      return undefined;
    }

    function handleClickCapture(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest('a[href]');
      if (!link || link.getAttribute('target') === '_blank') return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(href);
    }

    document.addEventListener('click', handleClickCapture, true);
    return () => document.removeEventListener('click', handleClickCapture, true);
  }, [active]);

  return {
    pendingNavigation,
    isNavigationBlocked: Boolean(pendingNavigation),
    confirmNavigation: (navigate) => {
      if (!pendingNavigation) return;
      const destination = pendingNavigation;
      setPendingNavigation(null);
      if (typeof navigate === 'function') {
        navigate(destination.startsWith('/') ? destination : `/${destination}`);
      } else {
        window.location.assign(destination);
      }
    },
    cancelNavigation: () => setPendingNavigation(null),
  };
}
