import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import CourseCard from '../components/ui/CourseCard';
import CategoryFilterBar from '../components/catalog/CategoryFilterBar';
import { CatalogCourseGridSkeleton } from '../components/catalog/CatalogCourseCardSkeleton';
import { usePublicCourseCategories, usePublicCatalogCourses } from '../hooks/usePublicCatalogCourses';
import {
  readCategoryIdFromSearchParams,
  writeCategorySearchParams,
} from '../course/publicCatalogQueries';
import './CoursesPage.css';

export default function CoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategoryId = readCategoryIdFromSearchParams(searchParams);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
  } = usePublicCourseCategories();

  const {
    courses,
    loading: coursesLoading,
    error: coursesError,
  } = usePublicCatalogCourses({ categoryId: selectedCategoryId });

  const selectedCategoryName = useMemo(() => {
    if (selectedCategoryId == null) return null;
    return categories.find((c) => Number(c.id) === selectedCategoryId)?.name ?? null;
  }, [categories, selectedCategoryId]);

  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return courses;
    const q = searchQuery.toLowerCase();
    return courses.filter(
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
  }, [courses, searchQuery]);

  function handleCategorySelect(categoryId) {
    const next = categoryId == null ? {} : writeCategorySearchParams(categoryId);
    setSearchParams(next, { replace: true });
  }

  const loadError = coursesError || categoriesError;
  const isInitialLoad = coursesLoading && courses.length === 0;
  const isRefetching = coursesLoading && courses.length > 0;

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
          <div className="courses-toolbar__filters">
            <CategoryFilterBar
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelect={handleCategorySelect}
              loading={categoriesLoading}
              disabled={Boolean(categoriesError)}
            />
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
          ) : isInitialLoad ? (
            <CatalogCourseGridSkeleton count={6} />
          ) : filteredCourses.length === 0 ? (
            <div className="courses-empty courses-empty--category">
              <h3 className="heading-3">
                {searchQuery.trim()
                  ? 'No courses match your search.'
                  : selectedCategoryId != null
                    ? `No courses in ${selectedCategoryName || 'this category'} yet.`
                    : 'No courses available right now.'}
              </h3>
              <p className="body-md">
                {searchQuery.trim()
                  ? 'Try a different keyword or clear your search.'
                  : selectedCategoryId != null
                    ? 'Check back soon — new courses are added regularly.'
                    : 'Please check back later.'}
              </p>
              {selectedCategoryId != null || searchQuery.trim() ? (
                <button
                  type="button"
                  className="btn btn--secondary courses-empty__action"
                  onClick={() => {
                    setSearchQuery('');
                    handleCategorySelect(null);
                  }}
                >
                  View all courses
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="courses-list__count body-sm" aria-live="polite">
                {isRefetching ? (
                  <span>Updating results…</span>
                ) : (
                  <>
                    Showing <strong>{filteredCourses.length}</strong> course
                    {filteredCourses.length === 1 ? '' : 's'}
                    {selectedCategoryName ? (
                      <>
                        {' '}
                        in <strong>{selectedCategoryName}</strong>
                      </>
                    ) : null}
                  </>
                )}
              </div>
              <div
                key={`catalog-grid-${selectedCategoryId ?? 'all'}`}
                className={`catalog-grid grid-cards${isRefetching ? ' catalog-grid--loading' : ' catalog-grid--visible'}`}
              >
                {filteredCourses.map((course) => (
                  <CourseCard key={String(course.id)} course={course} />
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
