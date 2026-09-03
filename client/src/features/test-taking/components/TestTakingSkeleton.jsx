export default function TestTakingSkeleton() {
  return (
    <div className="tt-exam tt-exam--loading" aria-busy="true" aria-label="Loading Test...">
      <div className="tt-skeleton-screen">
        <p className="tt-skeleton-screen__brand">MRB Classes</p>
        <p className="tt-skeleton-screen__title">Loading Test...</p>
        <div className="tt-skeleton tt-skeleton--question" />
        <div className="tt-skeleton tt-skeleton--option" />
        <div className="tt-skeleton tt-skeleton--option" />
        <div className="tt-skeleton tt-skeleton--option" />
        <div className="tt-skeleton tt-skeleton--option" />
      </div>
    </div>
  );
}
