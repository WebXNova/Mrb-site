import { Link, useNavigate } from 'react-router-dom';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import { adminRoute } from '../../config/adminPaths';
import { isStandaloneAccessType } from '../constants/testAccessType.js';
import SeatInventoryMeter from './SeatInventoryMeter';
import TestAdminBadges from './TestAdminBadges';
import TestRowActionsMenu from './TestRowActionsMenu';
import {
  formatAvgScoreCell,
  formatTestEditedCreatedLine,
  nextSortState,
} from '../utils/testListFormatting';
import {
  formatAdminDateTime,
  formatCourseLabel,
  formatTestAccessTypeLabel,
} from '../utils/testAdminDisplay.js';

const COLUMNS = [
  { key: 'title', label: 'Title', sortable: true },
  { key: 'type', label: 'Type', sortable: false },
  { key: 'course', label: 'Course', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'schedule', label: 'Schedule', sortable: false },
  { key: 'seats', label: 'Seats', sortable: false },
  { key: 'questions', label: 'Questions', sortable: true, align: 'right' },
  { key: 'scores', label: 'Attempts', sortable: true, align: 'right' },
  { key: 'avg_score', label: 'Avg %', sortable: true, align: 'right' },
  { key: 'actions', label: 'Actions', sortable: false },
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

function ScheduleCell({ test }) {
  if (!isStandaloneAccessType(test.testAccessType)) {
    return <span className="tests-list-table__muted">Enrollment-based</span>;
  }
  const start = formatAdminDateTime(test.startDate ?? test.start_date);
  const end = formatAdminDateTime(test.endDate ?? test.end_date);
  if (start === '—' && end === '—') {
    return <span className="tests-list-table__muted">Schedule not set</span>;
  }
  return (
    <div className="tests-list-table__schedule">
      <span>{start}</span>
      <span className="tests-list-table__schedule-sep">to</span>
      <span>{end}</span>
    </div>
  );
}

/**
 * Sortable tests table with type, course, availability, seats, and row actions.
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
  onPublish,
  onDuplicate,
  onDownloadResults,
  onExportTest,
  onDelete,
  onCopyLink,
  busyAction = '',
}) {
  const navigate = useNavigate();
  const showActions = typeof onPublish === 'function';

  function handleSort(column) {
    onSortChange?.(nextSortState(column, { sortBy, sortDirection }));
  }

  function handleRowNavigate(testId, event) {
    if (event.target.closest('input, a, button, label, .admin-action-menu')) return;
    navigate(adminRoute(`tests/${testId}/dashboard`));
  }

  const columns = showActions ? COLUMNS : COLUMNS.filter((column) => column.key !== 'actions');

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
              {columns.map((column) => (
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
              const standalone = isStandaloneAccessType(test.testAccessType);

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
                  <td className="tests-list-table__type-cell">{formatTestAccessTypeLabel(test.testAccessType)}</td>
                  <td className="tests-list-table__course-cell">
                    {standalone ? '—' : formatCourseLabel(test)}
                  </td>
                  <td>
                    <TestAdminBadges test={test} showType={false} />
                  </td>
                  <td className="tests-list-table__schedule-cell">
                    <ScheduleCell test={test} />
                  </td>
                  <td className="tests-list-table__seats-cell">
                    {standalone ? <SeatInventoryMeter test={test} compact /> : <span className="tests-list-table__muted">—</span>}
                  </td>
                  <td className="tests-list-table__num-cell">{Number(test.questionCount ?? 0)}</td>
                  <td className="tests-list-table__num-cell">{Number(test.scoresCount ?? 0)}</td>
                  <td className="tests-list-table__score-cell">
                    <span className="tests-list-table__score-avg">{scoreCell.avg}</span>
                    {scoreCell.range ? (
                      <span className="tests-list-table__score-range">{scoreCell.range}</span>
                    ) : null}
                  </td>
                  {showActions ? (
                    <td className="tests-list-table__actions-cell" onClick={(event) => event.stopPropagation()}>
                      <TestRowActionsMenu
                        test={test}
                        onPublish={onPublish}
                        onDuplicate={onDuplicate}
                        onDownloadResults={onDownloadResults}
                        onExportTest={onExportTest}
                        onDelete={onDelete}
                        onCopyLink={onCopyLink}
                        busyAction={busyAction}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
