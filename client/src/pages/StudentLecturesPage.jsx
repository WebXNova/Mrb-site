import { useMemo, useState } from 'react';
import StudentLectureFilters from '../student/components/lectures/StudentLectureFilters';
import StudentLecturePlaylist from '../student/components/lectures/StudentLecturePlaylist';
import StudentNotesSection from '../student/components/notes/StudentNotesSection';
import { useStudentLectures } from '../student/hooks/useStudentLectures';
import {
  extractLectureFilterOptions,
  filterStudentLectures,
} from '../student/utils/groupStudentLectures';

export default function StudentLecturesPage() {
  const { lectures, loading, error } = useStudentLectures();
  const [courseId, setCourseId] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const [chapterId, setChapterId] = useState('all');
  const [search, setSearch] = useState('');

  const courseTabs = useMemo(() => {
    const rows = [];
    const seen = new Set();
    for (const lecture of lectures) {
      const id = String(lecture.courseId ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        label: lecture.courseTitle || `Course ${id}`,
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

  const notesContext = useMemo(() => {
    if (courseId === 'all') return null;
    const cid = Number(courseId);
    if (!Number.isInteger(cid) || cid <= 0) return null;
    if (chapterId !== 'all') {
      return {
        courseId: cid,
        chapterId: Number(chapterId),
        title: 'Chapter notes',
      };
    }
    if (subjectId !== 'all') {
      return {
        courseId: cid,
        subjectId: Number(subjectId),
        title: 'Subject notes',
      };
    }
    return {
      courseId: cid,
      title: 'Course notes',
    };
  }, [courseId, subjectId, chapterId]);

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

  return (
    <section className="admin-card student-lectures-page">
      <div className="student-page-header">
        <div>
          <h2 className="heading-3" style={{ margin: 0 }}>
            Lectures
          </h2>
          <p className="student-lectures-page__intro">
            Browse your course lectures by subject and chapter. Use filters to find what you need quickly.
          </p>
        </div>
      </div>

      {loading ? <p className="student-lectures-page__status">Loading lectures…</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}

      {!loading ? (
        <>
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

          <StudentLecturePlaylist lectures={filteredLectures} />

          {notesContext ? (
            <article className="admin-card student-lectures-page__notes">
              <StudentNotesSection
                courseId={notesContext.courseId}
                subjectId={notesContext.subjectId}
                chapterId={notesContext.chapterId}
                title={notesContext.title}
              />
            </article>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
