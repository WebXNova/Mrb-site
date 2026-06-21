import { useEffect } from 'react';
import { useBeforeUnloadGuard } from '../../test-taking/hooks/useOnlineStatus.js';

const LEAVE_MESSAGE =
  'You have unsaved question changes. Leave this page anyway? Unsaved work may be lost.';

/**
 * Browser tab close + in-app link navigation guard for dirty quiz drafts.
 * Uses click capture instead of useBlocker so it works with BrowserRouter.
 *
 * @param {boolean} when
 */
export function useQuizUnsavedRouteGuard(when) {
  useBeforeUnloadGuard(when, LEAVE_MESSAGE);

  useEffect(() => {
    if (!when) return undefined;

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
      } catch {
        return;
      }

      if (!window.confirm(LEAVE_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener('click', handleClickCapture, true);
    return () => document.removeEventListener('click', handleClickCapture, true);
  }, [when]);
}
