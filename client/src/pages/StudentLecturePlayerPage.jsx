import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { mockStudentDashboard } from '../student/data/mockStudentData';

function getEmbedUrl(url) {
  if (!url) return '';
  const shortMatch = url.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
  const watchMatch = url.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
  return url.includes('/embed/') ? url : url.replace('watch?v=', 'embed/');
}

export default function StudentLecturePlayerPage() {
  const { id } = useParams();
  const [lectures, setLectures] = useState(mockStudentDashboard.lectures);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await studentApi.dashboard();
        if (mounted && response?.data?.lectures?.length) {
          setLectures(response.data.lectures);
        }
      } catch {
        // fallback to mock data
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const lecture = useMemo(
    () => lectures.find((item) => String(item.id) === String(id)) || lectures[0],
    [id, lectures]
  );

  if (!lecture) {
    return (
      <section className="admin-card">
        <h2 className="heading-3">Lecture not found</h2>
      </section>
    );
  }

  return (
    <section className="admin-card">
      <h2 className="heading-3">{lecture.title}</h2>
      <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
        {lecture.courseTitle} • {lecture.subject} • {lecture.durationMinutes} min
      </p>
      <div style={{ marginTop: '1rem', aspectRatio: '16 / 9' }}>
        <iframe
          width="100%"
          height="100%"
          src={getEmbedUrl(lecture.youtubeUrl)}
          title={lecture.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          style={{ border: 0, borderRadius: '12px' }}
        />
      </div>
    </section>
  );
}
