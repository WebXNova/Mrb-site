import { useEffect, useState } from 'react';

function easeSpring(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

export function statColorForProgress(progress, done) {
  if (done) return undefined;
  if (progress >= 0.75) return '#3B82F6';
  return '#1E293B';
}

/**
 * Count-up with spring easing for dashboard stats.
 */
export function useAnimatedStat(target, { duration = 800, enabled = true, decimals = 0 } = {}) {
  const [value, setValue] = useState(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setValue(0);
      setProgress(0);
      setDone(false);
      return undefined;
    }

    const end = Number(target);
    if (!Number.isFinite(end)) {
      setValue(0);
      setProgress(0);
      setDone(false);
      return undefined;
    }

    let frame = 0;
    const start = performance.now();
    setDone(false);

    function tick(now) {
      const elapsed = now - start;
      const raw = Math.min(elapsed / duration, 1);
      const eased = easeSpring(raw);
      const next = end * eased;
      setProgress(raw);
      setValue(decimals > 0 ? Number(next.toFixed(decimals)) : Math.round(next));

      if (raw < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setValue(decimals > 0 ? Number(end.toFixed(decimals)) : Math.round(end));
        setProgress(1);
        setDone(true);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, enabled, decimals]);

  const color = statColorForProgress(progress, done);

  return { value, progress, done, color };
}
