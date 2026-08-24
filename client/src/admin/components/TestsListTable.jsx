import { Link, useNavigate } from 'react-router-dom';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import { adminRoute } from '../../config/adminPaths';
import TestStatusBadge from './TestStatusBadge';
import {
  formatAvgScoreCell,
  formatTestEditedCreatedLine,
  nextSortState,
} from '../utils/testListFormatting';

const COLUMNS = [
  { key: 'title', label: 'Title', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'questions', label: 'Questions', sortable: true, align: 'right' },
  { key: 'scores', label: '# of Scores', sortable: true, align: 'right' },
  { key: 'avg_score', label: 'Avg Score', sortable: true, align: 'right' },
];

function SortIcon({ column, sortBy, sortDirection }) {
  if (sortBy !== column) {
    return <UnfoldMoreIcon className="tests-list-table__sort-icon tests-list-table__sort-icon--idle" aria-hidden />;
  }
  return sortDirection === 'asc' ? (
    <ArrowUpwardIcon className="tests-list-table__sort-icon" aria-hidden />
  ) : (
    <ArrowDownwardIcon className="tests-list-table__sort-icon" aria-hidden />
  );
}

/**
 * Testmoz-style sortable tests table with row selection.
 */
export default function TestsListTable({
  tests,
  sortBy,
  sortDirection,
  onSortChange,
  selectedIds,
  onToggleRow,
  onToggleAll,
  allSelected,
  someSelected,
}) {
  const navigate = useNavigate();

  function handleSort(column) {
    onSortChange?.(nextSortState(column, { sortBy, sortDirection }));
  }

  function handleRowNavigate(testId, event) {
    if (event.target.closest('input, a, button, label')) return;
    navigate(adminRoute(`tests/${testId}/dashboard`));
  }

  return (
    <div className="tests-list-table-shell">
      <div className="tests-list-table-scroll">
        <table className="tests-list-table">
          <thead>
            <tr>
              <th scope="col" className="tests-list-table__check-col">
                <input
                  type="checkbox"
                  aria-label="Select all tests on this page"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={(event) => onToggleAll?.(event.target.checked)}
                />
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`tests-list-table__head-cell${column.align === 'right' ? ' tests-list-table__head-cell--right' : ''}${
                    column.sortable ? ' tests-list-table__head-cell--sortable' : ''
                  }`}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="tests-list-table__sort-btn"
                      onClick={() => handleSort(column.key)}
                      aria-sort={
                        sortBy === column.key
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <span>{column.label}</span>
                      <SortIcon column={column.key} sortBy={sortBy} sortDirection={sortDirection} />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tests.map((test) => {
              const scoreCell = formatAvgScoreCell(test);
              const selected = selectedIds.has(Number(test.id));

              return (
                <tr
                  key={test.id}
                  className={`tests-list-table__row${selected ? ' tests-list-table__row--selected' : ''}`}
                  onClick={(event) => handleRowNavigate(test.id, event)}
                >
                  <td className="tests-list-table__check-col">
                    <input
                      type="checkbox"
                      aria-label={`Select ${test.title}`}
                      checked={selected}
                      onChange={() => onToggleRow?.(Number(test.id))}
                    />
                  </td>
                  <td className="tests-list-table__title-cell">
                    <Link className="tests-list-table__title-link" to={adminRoute(`tests/${test.id}/dashboard`)}>
                      {test.title || `Test #${test.id}`}
                    </Link>
                    <p className="tests-list-table__date-line">{formatTestEditedCreatedLine(test)}</p>
                  </td>
                  <td>
                    <TestStatusBadge status={test.status} />
                  </td>
                  <td className="tests-list-table__num-cell">{Number(test.questionCount ?? 0)}</td>
                  <td className="tests-list-table__num-cell">{Number(test.scoresCount ?? 0)}</td>
                  <td className="tests-list-table__score-cell">
                    <span className="tests-list-table__score-avg">{scoreCell.avg}</span>
                    {scoreCell.range ? (
                      <span className="tests-list-table__score-range">{scoreCell.range}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
