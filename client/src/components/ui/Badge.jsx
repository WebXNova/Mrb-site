import './Badge.css';

export default function Badge({ children, tone = 'neutral', size = 'md', className = '' }) {
  return (
    <span className={`badge badge--${tone} badge--${size} ${className}`.trim()}>
      {children}
    </span>
  );
}
