export default function TestTakingSkeleton() {
  return (
    <div className="tt-exam" aria-busy="true" aria-label="Loading exam">
      <div className="tt-skeleton tt-skeleton--header" />
      <div className="tt-exam__body">
        <div className="tt-exam__main">
          <div className="tt-skeleton tt-skeleton--card" />
          <div className="tt-skeleton tt-skeleton--nav" />
        </div>
        <aside className="tt-exam__sidebar tt-exam__sidebar--skeleton" aria-hidden="true">
          <div className="tt-skeleton tt-skeleton--palette" />
        </aside>
      </div>
    </div>
  );
}
