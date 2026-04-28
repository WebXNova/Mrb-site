import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import CourseCard from '../components/ui/CourseCard';
import { courses, subjects, getCoursesBySubject } from '../data/courses';
import './CoursesPage.css';

export default function CoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSubject = searchParams.get('subject') || 'all';
  const [activeSubject, setActiveSubject] = useState(initialSubject);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCourses = useMemo(() => {
    let list = getCoursesBySubject(activeSubject);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          c.instructor.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeSubject, searchQuery]);

  const handleSubjectChange = (subjectId) => {
    setActiveSubject(subjectId);
    if (subjectId === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ subject: subjectId });
    }
  };

  return (
    <PageLayout>
      <section className="courses-hero">
        <div className="container">
          <span className="eyebrow">Course library</span>
          <h1 className="heading-1 text-balance">
            Elite MDCAT & ECAT Preparation designed for high-performance results in Physics, Chemistry, and Biology.
          </h1>
          <p className="body-lg text-pretty courses-hero__lead">
            Each course pairs structured lectures with timed tests and real teacher
            answers — so you actually understand what you study.
          </p>
        </div>
      </section>

      <section className="courses-toolbar">
        <div className="container courses-toolbar__inner">
          <div className="courses-toolbar__filters" role="tablist" aria-label="Filter by subject">
            {subjects.map((subject) => (
              <button
                key={subject.id}
                type="button"
                role="tab"
                aria-selected={activeSubject === subject.id}
                className={`courses-toolbar__filter ${
                  activeSubject === subject.id
                    ? 'courses-toolbar__filter--active'
                    : ''
                }`}
                onClick={() => handleSubjectChange(subject.id)}
              >
                {subject.name}
              </button>
            ))}
          </div>

          <label className="courses-toolbar__search">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search courses or instructors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search courses"
            />
          </label>
        </div>
      </section>

      <section className="courses-list section-tight">
        <div className="container">
          {filteredCourses.length === 0 ? (
            <div className="courses-empty">
              <h3 className="heading-3">No courses match your search.</h3>
              <p className="body-md">
                Try a different subject or clear your search query.
              </p>
            </div>
          ) : (
            <>
              <div className="courses-list__count body-sm">
                Showing <strong>{filteredCourses.length}</strong> course
                {filteredCourses.length === 1 ? '' : 's'}
              </div>
              <div className="grid-cards">
                {filteredCourses.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </PageLayout>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
