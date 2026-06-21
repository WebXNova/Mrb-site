import { useEffect, useRef, useState } from 'react';

export default function StudentDashboardCursorGlow({ containerRef }) {
  const glowRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const glow = glowRef.current;
    if (!container || !glow) return undefined;

    function onMove(event) {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      glow.style.transform = `translate(${x}px, ${y}px)`;
      setVisible(true);
    }

    function onLeave() {
      setVisible(false);
    }

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [containerRef]);

  return (
    <div
      ref={glowRef}
      className={`sd-cursor-glow${visible ? ' sd-cursor-glow--visible' : ''}`}
      aria-hidden
    />
  );
}
