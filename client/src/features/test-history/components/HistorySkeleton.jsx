export default function HistorySkeleton() {
  return (
    <div className="th-page" aria-busy="true" aria-label="Loading results">
      <div className="th-skeleton th-skeleton--title" />
      <div className="th-stats__grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="th-skeleton th-skeleton--stat" />
        ))}
      </div>
      <div className="th-charts th-charts--skeleton">
        <div className="th-skeleton th-skeleton--chart" />
        <div className="th-skeleton th-skeleton--chart" />
      </div>
      <div className="th-skeleton th-skeleton--filters" />
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="th-skeleton th-skeleton--row" />
      ))}
    </div>
  );
}
