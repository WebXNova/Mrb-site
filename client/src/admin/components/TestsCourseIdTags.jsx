import { useEffect, useMemo, useState } from 'react';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

/** Tags shown per page — keeps the cloud readable as course count grows. */
const TAGS_PER_PAGE = 42;

/** Rotating tag colors — Testmoz-style course ID chips. */
const TAG_PALETTE = [
  { bg: '#fbcfe8', text: '#831843', border: '#f472b6' },
  { bg: '#bbf7d0', text: '#14532d', border: '#4ade80' },
  { bg: '#bfdbfe', text: '#1e3a8a', border: '#60a5fa' },
  { bg: '#fde68a', text: '#78350f', border: '#fbbf24' },
  { bg: '#ddd6fe', text: '#4c1d95', border: '#a78bfa' },
  { bg: '#fed7aa', text: '#7c2d12', border: '#fb923c' },
  { bg: '#99f6e4', text: '#134e4a', border: '#2dd4bf' },
  { bg: '#c7d2fe', text: '#312e81', border: '#818cf8' },
  { bg: '#fecaca', text: '#7f1d1d', border: '#f87171' },
  { bg: '#d9f99d', text: '#365314', border: '#a3e635' },
];

/**
 * Search + paginated course ID tag cloud in one Testmoz-style strip.
 *
 * @param {{
 *   courses: Array<{ id: number|string, title?: string }>,
 *   selectedCourseId: string|number,
 *   onSelectCourse: (courseId: string) => void,
 *   isLoading?: boolean,
 *   searchControl: import('react').ReactNode,
 * }} props
 */
export default function TestsCourseIdTags({
  courses,
  selectedCourseId,
  onSelectCourse,
  isLoading = false,
  searchControl,
}) {
  const activeId = selectedCourseId ? String(selectedCourseId) : '';
  const [tagPage, setTagPage] = useState(1);

  const totalTagPages = Math.max(1, Math.ceil(courses.length / TAGS_PER_PAGE));

  const paginatedCourses = useMemo(() => {
    const start = (tagPage - 1) * TAGS_PER_PAGE;
    return courses.slice(start, start + TAGS_PER_PAGE);
  }, [courses, tagPage]);

  useEffect(() => {
    if (tagPage > totalTagPages) setTagPage(totalTagPages);
  }, [tagPage, totalTagPages]);

  useEffect(() => {
    if (!activeId) return;
    const index = courses.findIndex((course) => String(course.id) === activeId);
    if (index < 0) return;
    setTagPage(Math.floor(index / TAGS_PER_PAGE) + 1);
  }, [activeId, courses]);

  function goToTagPage(nextPage) {
    setTagPage(Math.min(Math.max(1, nextPage), totalTagPages));
  }

  return (
    <section className="tests-moz-filter" aria-label="Search and filter by course ID">
      <div className="tests-moz-filter__controls">
        <div className="tests-moz-filter__search">{searchControl}</div>
        {courses.length > 0 ? (
          <nav className="tests-moz-filter__pager" aria-label="Course ID pages">
            <span className="tests-moz-filter__pager-label">
              Page {tagPage} of {totalTagPages}
            </span>
            <button
              type="button"
              className="tests-moz-filter__pager-btn"
              disabled={tagPage <= 1 || isLoading}
              onClick={() => goToTagPage(tagPage - 1)}
              aria-label="Previous course IDs page"
            >
              <ChevronLeftIcon fontSize="small" />
            </button>
            <button
              type="button"
              className="tests-moz-filter__pager-btn"
              disabled={tagPage >= totalTagPages || isLoading}
              onClick={() => goToTagPage(tagPage + 1)}
              aria-label="Next course IDs page"
            >
              <ChevronRightIcon fontSize="small" />
            </button>
          </nav>
        ) : null}
      </div>

      <div className="tests-moz-filter__tags" role="listbox" aria-label="Course ID filters">
        <button
          type="button"
          role="option"
          aria-selected={!activeId}
          className={`tests-course-tag tests-course-tag--all${!activeId ? ' tests-course-tag--active' : ''}`}
          onClick={() => onSelectCourse('')}
        >
          All
        </button>

        {isLoading ? (
          <span className="tests-course-tags__loading">Loading courses…</span>
        ) : courses.length === 0 ? (
          <span className="tests-course-tags__empty">No courses</span>
        ) : (
          paginatedCourses.map((course, index) => {
            const id = String(course.id);
            const globalIndex = (tagPage - 1) * TAGS_PER_PAGE + index;
            const palette = TAG_PALETTE[globalIndex % TAG_PALETTE.length];
            const isActive = activeId === id;

            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={isActive}
                title={course.title ? `Course #${id} — ${course.title}` : `Course #${id}`}
                className={`tests-course-tag${isActive ? ' tests-course-tag--active' : ''}`}
                style={{
                  '--tag-bg': palette.bg,
                  '--tag-text': palette.text,
                  '--tag-border': palette.border,
                }}
                onClick={() => onSelectCourse(isActive ? '' : id)}
              >
                {id}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
