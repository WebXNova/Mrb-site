export default function HistoryEmpty({ hasFilters }) {
  return (
    <div className="th-empty" role="status">
      <h2 className="th-empty__title">
        {hasFilters ? 'No matching attempts' : 'No test attempts yet'}
      </h2>
      <p className="th-empty__message">
        {hasFilters
          ? 'Try adjusting your search or filters to find completed tests.'
          : 'Complete a test to see your results here.'}
      </p>
    </div>
  );
}
