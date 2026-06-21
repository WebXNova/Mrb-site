const PARTICLES = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: `${(index * 17 + 7) % 100}%`,
  top: `${(index * 23 + 11) % 100}%`,
  size: 2 + (index % 3),
  delay: `${(index * 0.7) % 8}s`,
  duration: `${10 + (index % 6) * 2}s`,
}));

export default function StudentDashboardParticles() {
  return (
    <div className="sd-particles" aria-hidden>
      {PARTICLES.map((particle) => (
        <span
          key={particle.id}
          className="sd-particles__mote"
          style={{
            left: particle.left,
            top: particle.top,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
          }}
        />
      ))}
    </div>
  );
}
