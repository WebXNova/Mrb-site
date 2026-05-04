import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { mockStudentDashboard } from '../student/data/mockStudentData';
import { normaliseStudentDashboard } from '../student/utils/normaliseStudentDashboard';

function getEmbedUrl(url) {
  if (!url) return '';
  const shortMatch = url.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  const watchMatch = url.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  return url.includes('/embed/') ? url : url.replace('watch?v=', 'embed/');
}

export default function StudentLecturesPage() {
  const [lectures, setLectures] = useState(mockStudentDashboard.lectures);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await studentApi.dashboard();
        const norm = normaliseStudentDashboard(response?.data || mockStudentDashboard);
        if (mounted && norm.lectures.length) {
          setLectures(norm.lectures);
        }
      } catch {
        // Preview mode with frontend data.
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const categories = Array.from(
    new Set(['MDCAT', ...lectures.map((lecture) => lecture.courseSubject || lecture.subject || '').filter(Boolean)])
  );
  const filteredLectures =
    activeCategory === 'all'
      ? lectures
      : lectures.filter(
          (lecture) => (lecture.courseSubject || lecture.subject || '').toLowerCase() === activeCategory.toLowerCase()
        );

  return (
    <section className="admin-card">
      <h2 className="heading-3">Lectures</h2>
      <div className="student-lecture-tabs">
        <button
          type="button"
          className={`student-lecture-tab ${activeCategory === 'all' ? 'student-lecture-tab--active' : ''}`}
          onClick={() => setActiveCategory('all')}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={`student-lecture-tab ${activeCategory === category ? 'student-lecture-tab--active' : ''}`}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="student-lecture-list">
        {filteredLectures.length ? (
          filteredLectures.map((lecture, index) => (
            <article key={lecture.id} className="student-lecture-card">
              <div className="student-lecture-card__video">
                <iframe
                  width="100%"
                  height="100%"
                  src={getEmbedUrl(lecture.youtubeUrl)}
                  title={lecture.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
              <p className="student-lecture-card__course">
                👉 {(lecture.courseSubject || lecture.subject || 'MDCAT')}
                : {lecture.courseTitle || 'Course'}
              </p>
              <h3 className="student-lecture-card__title">Lec-{index + 1} {lecture.title}</h3>
              <div className="student-lecture-card__actions">
                <Link to={`/dashboard/lectures/${lecture.id}`} className="student-lecture-card__link">
                  Open in player
                </Link>
                <a
                  href={lecture.youtubeUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="student-lecture-card__youtube"
                >
                  Watch on YouTube
                </a>
              </div>
            </article>
          ))
        ) : (
          <p className="admin-stat-card__label" style={{ marginTop: '0.75rem' }}>
            No lectures available in this category.
          </p>
        )}
      </div>
    </section>
  );
}
