import { useEffect, useState } from 'react';

export default function StudentProgressBar({ percent = 0, inView = true, className = '' }) {
  const [width, setWidth] = useState(0);
  const clamped = Math.min(100, Math.max(0, percent));

  useEffect(() => {
    if (!inView) {
      setWidth(0);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setWidth(clamped));
    return () => cancelAnimationFrame(frame);
  }, [inView, clamped]);

  return (
    <div className={`sp-progress sd-progress ${className}`.trim()}>
      <div className="sp-progress__track sd-progress__track">
        <div className="sp-progress__fill sd-progress__fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
