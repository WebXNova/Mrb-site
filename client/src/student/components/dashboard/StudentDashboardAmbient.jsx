const SHAPES = [
  { type: 'circle', left: '8%', top: '12%', size: 120, color: 'rgba(212, 175, 55, 0.08)', duration: 58, delay: 0 },
  { type: 'circle', left: '78%', top: '18%', size: 90, color: 'rgba(139, 26, 43, 0.1)', duration: 62, delay: 4 },
  { type: 'hex', left: '62%', top: '68%', size: 80, color: 'rgba(245, 166, 35, 0.07)', duration: 54, delay: 2 },
  { type: 'circle', left: '22%', top: '72%', size: 64, color: 'rgba(45, 27, 78, 0.12)', duration: 66, delay: 6 },
  { type: 'hex', left: '88%', top: '52%', size: 56, color: 'rgba(201, 168, 76, 0.09)', duration: 60, delay: 1 },
  { type: 'circle', left: '44%', top: '38%', size: 48, color: 'rgba(212, 175, 55, 0.06)', duration: 52, delay: 3 },
];

export default function StudentDashboardAmbient() {
  return (
    <div className="sd-ambient" aria-hidden>
      <div className="sd-ambient__gradient" />
      <div className="sd-ambient__noise" />
      <div className="sd-ambient__shapes">
        {SHAPES.map((shape) => (
          <span
            key={`${shape.type}-${shape.left}-${shape.top}`}
            className={`sd-ambient__shape sd-ambient__shape--${shape.type}`}
            style={{
              left: shape.left,
              top: shape.top,
              width: shape.size,
              height: shape.size,
              background: shape.type === 'circle' ? shape.color : undefined,
              borderColor: shape.type === 'hex' ? shape.color : undefined,
              animationDuration: `${shape.duration}s`,
              animationDelay: `${shape.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
