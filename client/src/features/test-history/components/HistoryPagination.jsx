export default function HistoryPagination({ pagination, onPageChange, disabled }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, totalItems } = pagination;

  return (
    <nav className="th-pagination" aria-label="Results pagination">
      <p className="th-pagination__info">
        Page {page} of {totalPages} ({totalItems} attempts)
      </p>
      <div className="th-pagination__actions">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
