import { motion } from 'framer-motion';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';

const SUBJECTS = [
  { value: '', label: 'All subjects' },
  { value: 'physics', label: 'Physics' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'biology', label: 'Biology' },
  { value: 'english', label: 'English' },
  { value: 'logical_reasoning', label: 'Logical reasoning' },
];

/**
 * @param {{
 *   teachers: Record<string, unknown>[],
 *   filters: Record<string, string>,
 *   onFilterChange: (key: string, value: string) => void,
 *   onExport: () => void,
 *   exporting?: boolean,
 * }} props
 */
export default function MonitoringFilters({
  teachers,
  filters,
  onFilterChange,
  onExport,
  exporting = false,
}) {
  return (
    <motion.div
      className="qa-filters"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <select
        className="qa-teacher-select"
        value={filters.teacherId}
        onChange={(e) => onFilterChange('teacherId', e.target.value)}
        aria-label="Select teacher"
      >
        <option value="">All teachers</option>
        {teachers.map((t) => (
          <option key={t.id} value={String(t.id)}>
            {t.fullName || t.name || `Teacher #${t.id}`}
          </option>
        ))}
      </select>

      <div className="qa-filters__search">
        <SearchOutlinedIcon className="qa-filters__search-icon" sx={{ fontSize: 18 }} />
        <input
          type="search"
          placeholder="Search students, questions…"
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
          aria-label="Search conversations"
        />
      </div>

      <select
        value={filters.subject}
        onChange={(e) => onFilterChange('subject', e.target.value)}
        aria-label="Filter by subject"
      >
        {SUBJECTS.map((s) => (
          <option key={s.value || 'all'} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={filters.dateFrom}
        onChange={(e) => onFilterChange('dateFrom', e.target.value)}
        aria-label="Date from"
      />
      <input
        type="date"
        value={filters.dateTo}
        onChange={(e) => onFilterChange('dateTo', e.target.value)}
        aria-label="Date to"
      />

      <div className="qa-filters__chips" role="group" aria-label="Status filter">
        {[
          { value: '', label: 'All' },
          { value: 'answered', label: 'Answered' },
          { value: 'pending', label: 'Pending' },
        ].map((chip) => (
          <button
            key={chip.value || 'all'}
            type="button"
            className={`qa-filter-chip${filters.status === chip.value ? ' qa-filter-chip--active' : ''}`}
            onClick={() => onFilterChange('status', chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="qa-monitor__btn"
        onClick={onExport}
        disabled={exporting}
        aria-label="Export report"
      >
        <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />
        {exporting ? 'Exporting…' : 'Export'}
      </button>
    </motion.div>
  );
}
