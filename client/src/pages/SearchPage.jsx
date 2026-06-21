import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import CourseCard from '../components/ui/CourseCard';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePublicCatalogCourses } from '../hooks/usePublicCatalogCourses';
import { searchCourses } from '../utils/courseSearch';
import './SearchPage.css';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { courses, loading, error } = usePublicCatalogCourses();
  const debouncedQuery = useDebouncedValue(query, 300);

  const results = useMemo(
    () => searchCourses(debouncedQuery, courses),
    [debouncedQuery, courses]
  );

  return (
    <PageLayout>
      <section className="search-page">
        <div className="container">
          <header className="search-page__head">
            <span className="eyebrow">Search</span>
            <h1 className="heading-1 text-balance">
              {query.trim() ? `Results for “${query.trim()}”` : 'Search courses'}
            </h1>
            <p className="body-lg text-pretty search-page__lead">
              Find MDCAT preparation courses and free tests by title or subject — Physics, Chemistry,
              Biology, and more.
            </p>
          </header>

          {loading ? <p className="search-page__status">Loading courses…</p> : null}
          {error ? <p className="search-page__status search-page__status--error">{error}</p> : null}

          {!loading && !error && query.trim() && results.length === 0 ? (
            <p className="search-page__status">No courses matched your search. Try another keyword.</p>
          ) : null}

          {!loading && !error && !query.trim() ? (
            <p className="search-page__status">Type a course name or subject in the search bar above.</p>
          ) : null}

          {results.length > 0 ? (
            <div className="search-page__grid">
              {results.map((course) => (
                <CourseCard key={String(course.id)} course={course} />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </PageLayout>
  );
}
