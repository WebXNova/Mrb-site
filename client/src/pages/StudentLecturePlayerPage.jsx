import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import StudentLectureFilters from '../student/components/lectures/StudentLectureFilters';
import StudentLecturePlaylist from '../student/components/lectures/StudentLecturePlaylist';
import { useStudentLectures } from '../student/hooks/useStudentLectures';
import {
  extractLectureFilterOptions,
  filterStudentLectures,
  findLectureNeighbors,
} from '../student/utils/groupStudentLectures';
import { getLectureEmbedUrl } from '../student/utils/lectureEmbedUrl';

export default function StudentLecturePlayerPage() {
  const { id } = useParams();
  const { lectures, loading, error, refresh, markLectureCompleted } = useStudentLectures();
  const [courseId, setCourseId] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const [chapterId, setChapterId] = useState('all');
  const [search, setSearch] = useState('');
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState('');

  const courseTabs = useMemo(() => {
    const rows = [];
    const seen = new Set();
    for (const lecture of lectures) {
      const cid = String(lecture.courseId ?? '');
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      rows.push({
        id: cid,
        label: lecture.courseTitle || `Course ${cid}`,
      });
    }
    rows.sort((a, b) => a.label.localeCompare(b.label));
    return rows;
  }, [lectures]);

  const scopedLectures = useMemo(
    () => filterStudentLectures(lectures, { courseId, subjectId: 'all', chapterId: 'all', search: '' }),
    [lectures, courseId]
  );

  const filterOptions = useMemo(() => extractLectureFilterOptions(scopedLectures), [scopedLectures]);

  const filteredLectures = useMemo(
    () => filterStudentLectures(lectures, { courseId, subjectId, chapterId, search }),
    [lectures, courseId, subjectId, chapterId, search]
  );

  const lecture = useMemo(
    () => lectures.find((item) => String(item.id) === String(id)) || null,
    [id, lectures]
  );

  const neighbors = useMemo(
    () => findLectureNeighbors(filteredLectures, id),
    [filteredLectures, id]
  );

  const isCompleted = Boolean(lecture?.completed);
  const isLocked = Boolean(lecture?.locked);
  const unlockReason = lecture?.unlockReason || '';

  const handleMarkComplete = useCallback(async () => {
    if (!lecture || isCompleted || isLocked || completeBusy) return;
    setCompleteBusy(true);
    setCompleteError('');
    try {
      await studentApi.completeLecture(lecture.id);
      markLectureCompleted(lecture.id);
      await refresh();
    } catch (err) {
      setCompleteError(err?.message || 'Could not mark lecture as complete.');
    } finally {
      setCompleteBusy(false);
    }
  }, [lecture, isCompleted, isLocked, completeBusy, markLectureCompleted, refresh]);

  function handleSubjectChange(value) {
    setSubjectId(value);
    setChapterId('all');
  }

  function clearFilters() {
    setSubjectId('all');
    setChapterId('all');
    setSearch('');
    setCourseId('all');
  }

  if (loading) {
    return (
      <section className="admin-card">
        <p className="student-lectures-page__status">Loading lecture…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-card">
        <p className="admin-error">{error}</p>
      </section>
    );
  }

  if (!lecture) {
    return (
      <section className="admin-card">
        <h2 className="heading-3">Lecture not found</h2>
        <p className="admin-stat-card__label" style={{ marginTop: '0.75rem' }}>
          This lecture may have been removed or you may not have access.
        </p>
        <Link to="/dashboard/lectures" className="btn btn--secondary" style={{ marginTop: '1rem' }}>
          Back to lectures
        </Link>
      </section>
    );
  }

  return (
    <section className="student-lecture-player">
      <div className="student-lecture-player__main">
        <div className="student-lecture-player__top">
          <Link to="/dashboard/lectures" className="student-lecture-player__back">
            ← All lectures
          </Link>
          <div className="student-lecture-player__nav">
            {neighbors.previous ? (
              <Link to={`/dashboard/lectures/${neighbors.previous.id}`} className="btn btn--ghost btn--sm">
                ← Previous
              </Link>
            ) : (
              <span className="btn btn--ghost btn--sm" aria-disabled="true">
                ← Previous
              </span>
            )}
            {neighbors.next ? (
              <Link to={`/dashboard/lectures/${neighbors.next.id}`} className="btn btn--ghost btn--sm">
                Next →
              </Link>
            ) : (
              <span className="btn btn--ghost btn--sm" aria-disabled="true">
                Next →
              </span>
            )}
          </div>
        </div>

        <article className="admin-card student-lecture-player__card">
          <p className="student-lecture-player__breadcrumb">
            {[lecture.subjectTitle, lecture.chapterTitle, lecture.courseTitle].filter(Boolean).join(' · ')}
          </p>
          <h1 className="student-lecture-player__title">{lecture.title}</h1>
          {lecture.topic ? <p className="student-lecture-player__topic">{lecture.topic}</p> : null}

          <div className="student-lecture-player__video">
            {isLocked ? (
              <div className="student-lecture-player__locked" role="status">
                <p className="student-lecture-player__locked-title">This lecture is locked</p>
                <p className="student-lecture-player__locked-reason">{unlockReason}</p>
              </div>
            ) : (
              <iframe
                width="100%"
                height="100%"
                src={getLectureEmbedUrl(lecture.youtubeUrl)}
                title={lecture.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            )}
          </div>

          <div className="student-lecture-player__actions">
            {!isLocked && lecture.youtubeUrl ? (
              <a
                href={lecture.youtubeUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn btn--secondary btn--sm"
              >
                Watch on YouTube
              </a>
            ) : null}
            {isLocked ? (
              <span className="btn btn--ghost btn--sm" aria-disabled="true">
                Locked
              </span>
            ) : isCompleted ? (
              <span className="student-complete-badge" aria-label="Lecture completed">
                <span className="student-complete-check" aria-hidden>
                  ✓
                </span>
                Completed
              </span>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handleMarkComplete}
                disabled={completeBusy}
              >
                {completeBusy ? 'Saving…' : 'Mark complete'}
              </button>
            )}
          </div>
          {completeError ? <p className="admin-error" style={{ marginTop: '0.75rem' }}>{completeError}</p> : null}
        </article>
      </div>

      <aside className="student-lecture-player__sidebar admin-card" aria-label="Lecture playlist">
        <h2 className="student-lecture-player__sidebar-title">Playlist</h2>
        <StudentLectureFilters
          subjects={filterOptions.subjects}
          chapters={filterOptions.chapters}
          courseTabs={courseTabs}
          subjectId={subjectId}
          chapterId={chapterId}
          courseId={courseId}
          search={search}
          resultCount={filteredLectures.length}
          totalCount={scopedLectures.length}
          onSubjectChange={handleSubjectChange}
          onChapterChange={setChapterId}
          onCourseChange={setCourseId}
          onSearchChange={setSearch}
          onClear={clearFilters}
        />
        <StudentLecturePlaylist
          lectures={filteredLectures}
          activeLectureId={lecture.id}
          compact
        />
      </aside>
    </section>
  );
}
