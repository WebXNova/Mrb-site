export default function TestResultSkeleton() {
  return (
    <div className="tr-page" aria-busy="true" aria-label="Loading test result">
      <div className="tr-skeleton tr-skeleton--header" />
      <div className="tr-skeleton tr-skeleton--badge" />
      <div className="tr-summary-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="tr-skeleton tr-skeleton--card" />
        ))}
      </div>
    </div>
  );
}
