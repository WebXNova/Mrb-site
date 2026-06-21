import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import CourseCard from '../components/ui/CourseCard';
import { catalogApi } from '../api/catalogApi';
import { subjects } from '../data/courses';
import {
  filterCoursesByCatalogFilter,
  mapCatalogCourseToCardProps,
} from '../course/coursePresentation';
import './CoursesPage.css';

export default function CoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'all';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogRows, setCatalogRows] = useState([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const fromUrl = searchParams.get('tab') || 'all';
    setActiveTab(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await catalogApi.listCourses();
        const rows = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) {
          setCatalogRows(rows);
          setLoadError('');
        }
      } catch (e) {
        if (!cancelled) {
          setCatalogRows([]);
          setLoadError(e?.message || 'Failed to load courses');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const courses = useMemo(
    () => catalogRows.map(mapCatalogCourseToCardProps).filter(Boolean),
    [catalogRows]
  );

  const filteredCourses = useMemo(() => {
    let list = filterCoursesByCatalogFilter(courses, activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          String(c.summary || '')
            .toLowerCase()
            .includes(q) ||
          String(c.level || '')
            .toLowerCase()
            .includes(q) ||
          String(c.id || '')
            .toString()
            .includes(q)
      );
    }
    return list;
  }, [activeTab, searchQuery, courses]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: tabId });
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
            Each course pairs structured lectures with timed tests and real teacher answers — so you actually
            understand what you study.
          </p>
        </div>
      </section>

      <section className="courses-toolbar">
        <div className="container courses-toolbar__inner">
          <div className="courses-toolbar__filters" role="tablist" aria-label="Filter courses">
            {subjects.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`courses-toolbar__filter ${
                  activeTab === tab.id ? 'courses-toolbar__filter--active' : ''
                }`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.name}
              </button>
            ))}
          </div>

          <label className="courses-toolbar__search">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search by title, summary, level, or course id..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search courses"
            />
          </label>
        </div>
      </section>

      <section className="courses-list section-tight">
        <div className="container">
          {loadError ? (
            <div className="courses-empty">
              <h3 className="heading-3">Could not load the catalog.</h3>
              <p className="body-md">{loadError}</p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="courses-empty">
              <h3 className="heading-3">No courses match your search.</h3>
              <p className="body-md">Try a different filter tab or clear your search query.</p>
            </div>
          ) : (
            <>
              <div className="courses-list__count body-sm">
                Showing <strong>{filteredCourses.length}</strong> course
                {filteredCourses.length === 1 ? '' : 's'}
              </div>
              <div className="grid-cards">
                {filteredCourses.map((course) => (
                  <CourseCard
                    key={String(course.id)}
                    course={course}
                  />
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
