import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function StudentRippleButton({ to, children, className = '' }) {
  const [ripples, setRipples] = useState([]);

  function spawnRipple(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const id = `${Date.now()}-${Math.random()}`;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setRipples((prev) => [...prev, { id, x, y }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 700);
  }

  return (
    <Link
      to={to}
      className={`sd-ripple-btn sp-btn ${className}`.trim()}
      onClick={spawnRipple}
    >
      <span className="sd-ripple-btn__label">{children}</span>
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="sd-ripple-btn__burst"
          style={{ left: ripple.x, top: ripple.y }}
          aria-hidden
        />
      ))}
    </Link>
  );
}
