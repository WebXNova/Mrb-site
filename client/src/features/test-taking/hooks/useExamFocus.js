import { useCallback, useEffect, useRef, useState } from 'react';
import { testTakingApi } from '../api/testTakingApi';
import {
  applyExamFullscreenDocumentClass,
  getFullscreenElement,
} from '../utils/examScroll';

function isFullscreenApiAvailable(node) {
  if (!node) return false;
  return Boolean(
    node.requestFullscreen || node.webkitRequestFullscreen || node.msRequestFullscreen
  );
}

async function requestNodeFullscreen(node) {
  if (node.requestFullscreen) {
    try {
      return await node.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      return node.requestFullscreen();
    }
  }
  if (node.webkitRequestFullscreen) return node.webkitRequestFullscreen();
  if (node.msRequestFullscreen) return node.msRequestFullscreen();
  throw new Error('Fullscreen API is not available.');
}

async function exitNodeFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
}

export function useExamFullscreen(targetRef, { required = false } = {}) {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(getFullscreenElement()));
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(() =>
    typeof document !== 'undefined' ? isFullscreenApiAvailable(document.documentElement) : false
  );
  const [hasEnteredOnce, setHasEnteredOnce] = useState(false);

  useEffect(() => {
    const node = targetRef?.current || document.documentElement;
    setSupported(isFullscreenApiAvailable(node) || isFullscreenApiAvailable(document.documentElement));

    function sync() {
      const active = Boolean(getFullscreenElement());
      setIsFullscreen(active);
      applyExamFullscreenDocumentClass(active);
      if (active) setHasEnteredOnce(true);
    }

    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    document.addEventListener('MSFullscreenChange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      document.removeEventListener('MSFullscreenChange', sync);
      const active = getFullscreenElement();
      if (active && (active === targetRef?.current || targetRef?.current?.contains(active))) {
        void exitNodeFullscreen();
      }
      applyExamFullscreenDocumentClass(false);
    };
  }, [targetRef]);

  const enter = useCallback(async () => {
    setError('');
    try {
      const node = targetRef?.current || document.documentElement;
      if (getFullscreenElement()) return;
      const target = isFullscreenApiAvailable(node)
        ? node
        : isFullscreenApiAvailable(document.documentElement)
          ? document.documentElement
          : null;
      if (!target) {
        setSupported(false);
        setError('Fullscreen is not available in this browser. You can continue the test in this window.');
        return;
      }
      applyExamFullscreenDocumentClass(true);
      setIsFullscreen(true);
      await requestNodeFullscreen(target);
    } catch {
      applyExamFullscreenDocumentClass(false);
      setIsFullscreen(false);
      setError('Fullscreen is not available in this browser. You can continue the test in this window.');
    }
  }, [targetRef]);

  const exit = useCallback(async () => {
    try {
      if (getFullscreenElement()) {
        await exitNodeFullscreen();
      }
    } catch {
      /* ignore */
    }
  }, []);

  return {
    isFullscreen,
    error,
    supported,
    required: Boolean(required),
    hasEnteredOnce,
    enter,
    exit,
  };
}

function messageForStrike(count) {
  if (count === 1) {
    return 'Suspicious activity detected. Warning 1 of 3. Stay on this page during the test.';
  }
  if (count === 2) {
    return 'Suspicious activity detected. Warning 2 of 3 — final warning. Leaving again will lock this test only.';
  }
  return 'This test is locked for your account after three focus warnings. Other tests are not affected.';
}

/**
 * Reports focus-loss to the server. The third event locks this test for this student.
 */
export function useExamPresenceWarning({ enabled, slug, attemptId, onBlocked } = {}) {
  const [warningCount, setWarningCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !slug || !attemptId) return undefined;

    async function onHide() {
      if (document.visibilityState !== 'hidden') return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const response = await testTakingApi.reportIntegrityEvent(slug, attemptId);
        const data = response?.data ?? response;
        const strikeCount = Number(data?.strikeCount ?? 0);
        setWarningCount(strikeCount);
        setVisible(true);
        if (data?.blocked || data?.shouldSubmit) {
          setBlocked(true);
          onBlocked?.(data);
        }
      } catch {
        setWarningCount((prev) => {
          const next = Math.min(3, prev + 1);
          setVisible(true);
          return next;
        });
      } finally {
        inFlightRef.current = false;
      }
    }

    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [attemptId, enabled, onBlocked, slug]);

  const dismiss = useCallback(() => {
    if (!blocked) setVisible(false);
  }, [blocked]);

  return {
    warningCount,
    visible,
    blocked,
    message: warningCount > 0 ? messageForStrike(warningCount) : '',
    dismiss,
  };
}
