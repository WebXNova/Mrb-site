import { useEffect, useState } from 'react';

/**
 * Animate a number from 0 to `target` when `enabled` becomes true.
 */
export function useCountUp(target, { duration = 1200, enabled = true, decimals = 0 } = {}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setValue(0);
      return undefined;
    }

    const end = Number(target);
    if (!Number.isFinite(end)) {
      setValue(0);
      return undefined;
    }

    let frame = 0;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const next = end * eased;
      setValue(decimals > 0 ? Number(next.toFixed(decimals)) : Math.round(next));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, enabled, decimals]);

  return value;
}
