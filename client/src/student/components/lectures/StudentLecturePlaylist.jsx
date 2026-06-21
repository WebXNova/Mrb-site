import { Link } from 'react-router-dom';
import { flattenLectureGroups, groupLecturesBySubjectAndChapter } from '../../utils/groupStudentLectures';
import { getLectureThumbnailUrl } from '../../utils/lectureEmbedUrl';

/**
 * @param {{
 *   lectures: object[],
 *   activeLectureId?: string | number | null,
 *   compact?: boolean,
 *   showThumbnails?: boolean,
 * }} props
 */
export default function StudentLecturePlaylist({
  lectures,
  activeLectureId = null,
  compact = false,
  showThumbnails = true,
}) {
  const groups = groupLecturesBySubjectAndChapter(lectures);
  const flatRows = flattenLectureGroups(groups);
  const numberByLectureId = new Map(flatRows.map((row) => [String(row.lecture.id), row.number]));

  if (!flatRows.length) {
    return (
      <div className="student-lecture-playlist__empty">
        <p>No lectures match your filters.</p>
        <p className="student-lecture-playlist__empty-hint">Try clearing filters or searching with different keywords.</p>
      </div>
    );
  }

  if (compact) {
    return (
      <ol className="student-lecture-playlist student-lecture-playlist--compact" aria-label="Lecture playlist">
        {flatRows.map(({ lecture, number, subject, chapter }) => {
          const isActive = String(lecture.id) === String(activeLectureId);
          const isCompleted = Boolean(lecture.completed);
          const thumbnail = getLectureThumbnailUrl(lecture.youtubeUrl);

          return (
            <li
              key={lecture.id}
              className={`student-lecture-playlist__item${isActive ? ' student-lecture-playlist__item--active' : ''}${isCompleted ? ' student-lecture-playlist__item--completed' : ''}`}
            >
              <Link
                to={`/dashboard/lectures/${lecture.id}`}
                className="student-lecture-playlist__link"
                aria-current={isActive ? 'true' : undefined}
              >
                {showThumbnails && thumbnail ? (
                  <img className="student-lecture-playlist__thumb" src={thumbnail} alt="" loading="lazy" />
                ) : (
                  <span className="student-lecture-playlist__num" aria-hidden="true">
                    {number}
                  </span>
                )}
                <span className="student-lecture-playlist__meta">
                  <span className="student-lecture-playlist__title">{lecture.title}</span>
                  <span className="student-lecture-playlist__breadcrumb">
                    {subject.title} · {chapter.title}
                  </span>
                </span>
                {isCompleted ? (
                  <span className="student-complete-check" aria-label="Completed">
                    ✓
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className="student-lecture-playlist" aria-label="Lecture playlist by subject and chapter">
      {groups.map((subject) => (
        <section key={subject.id} className="student-lecture-playlist__subject">
          <header className="student-lecture-playlist__subject-head">
            <h3 className="student-lecture-playlist__subject-title">{subject.title}</h3>
            <span className="student-lecture-playlist__subject-count">
              {subject.chapters.reduce((sum, chapter) => sum + chapter.lectures.length, 0)} lectures
            </span>
          </header>

          {subject.chapters.map((chapter) => (
            <div key={chapter.id} className="student-lecture-playlist__chapter">
              <h4 className="student-lecture-playlist__chapter-title">{chapter.title}</h4>
              <ol className="student-lecture-playlist__chapter-list">
                {chapter.lectures.map((lecture) => {
                  const isActive = String(lecture.id) === String(activeLectureId);
                  const isCompleted = Boolean(lecture.completed);
                  const thumbnail = getLectureThumbnailUrl(lecture.youtubeUrl);
                  const number = numberByLectureId.get(String(lecture.id));

                  return (
                    <li
                      key={lecture.id}
                      className={`student-lecture-playlist__item${isActive ? ' student-lecture-playlist__item--active' : ''}${isCompleted ? ' student-lecture-playlist__item--completed' : ''}`}
                    >
                      <Link
                        to={`/dashboard/lectures/${lecture.id}`}
                        className="student-lecture-playlist__link"
                        aria-current={isActive ? 'true' : undefined}
                      >
                        {showThumbnails && thumbnail ? (
                          <img className="student-lecture-playlist__thumb" src={thumbnail} alt="" loading="lazy" />
                        ) : (
                          <span className="student-lecture-playlist__num" aria-hidden="true">
                            {number ?? '—'}
                          </span>
                        )}
                        <span className="student-lecture-playlist__meta">
                          <span className="student-lecture-playlist__title">{lecture.title}</span>
                          {lecture.topic ? (
                            <span className="student-lecture-playlist__topic">{lecture.topic}</span>
                          ) : null}
                        </span>
                        {isCompleted ? (
                          <span className="student-complete-check" aria-label="Completed">
                            ✓
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
