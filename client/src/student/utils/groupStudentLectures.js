/**
 * @typedef {{ id: string, title: string }} LectureFilterOption
 * @typedef {{
 *   id: string,
 *   title: string,
 *   chapters: Array<{ id: string, title: string, lectures: object[] }>,
 * }} LectureSubjectGroup
 */

function lectureKey(lecture) {
  return String(lecture?.id ?? '');
}

function subjectKey(lecture) {
  const id = lecture?.subjectId;
  return id != null && id !== '' ? String(id) : `subject:${lecture?.subjectTitle || 'general'}`;
}

function chapterKey(lecture) {
  const id = lecture?.chapterId;
  return id != null && id !== '' ? String(id) : `chapter:${lecture?.chapterTitle || 'general'}`;
}

/**
 * @param {object[]} lectures
 * @returns {LectureSubjectGroup[]}
 */
export function groupLecturesBySubjectAndChapter(lectures = []) {
  const subjectMap = new Map();

  for (const lecture of lectures) {
    const sKey = subjectKey(lecture);
    if (!subjectMap.has(sKey)) {
      subjectMap.set(sKey, {
        id: sKey,
        title: lecture.subjectTitle || 'General',
        chapterMap: new Map(),
      });
    }

    const subject = subjectMap.get(sKey);
    const cKey = chapterKey(lecture);
    if (!subject.chapterMap.has(cKey)) {
      subject.chapterMap.set(cKey, {
        id: cKey,
        title: lecture.chapterTitle || 'General',
        lectures: [],
      });
    }

    subject.chapterMap.get(cKey).lectures.push(lecture);
  }

  return Array.from(subjectMap.values()).map((subject) => ({
    id: subject.id,
    title: subject.title,
    chapters: Array.from(subject.chapterMap.values()),
  }));
}

/**
 * @param {object[]} lectures
 * @returns {{ subjects: LectureFilterOption[], chapters: Array<LectureFilterOption & { subjectId: string }> }}
 */
export function extractLectureFilterOptions(lectures = []) {
  const subjects = [];
  const chapters = [];
  const seenSubjects = new Set();
  const seenChapters = new Set();

  for (const lecture of lectures) {
    const sKey = subjectKey(lecture);
    if (!seenSubjects.has(sKey)) {
      seenSubjects.add(sKey);
      subjects.push({ id: sKey, title: lecture.subjectTitle || 'General' });
    }

    const cKey = chapterKey(lecture);
    const chapterComposite = `${sKey}::${cKey}`;
    if (!seenChapters.has(chapterComposite)) {
      seenChapters.add(chapterComposite);
      chapters.push({
        id: cKey,
        subjectId: sKey,
        title: lecture.chapterTitle || 'General',
      });
    }
  }

  return { subjects, chapters };
}

/**
 * @param {object[]} lectures
 * @param {{
 *   courseId?: string,
 *   subjectId?: string,
 *   chapterId?: string,
 *   search?: string,
 * }} filters
 */
export function filterStudentLectures(lectures = [], filters = {}) {
  const { courseId = 'all', subjectId = 'all', chapterId = 'all', search = '' } = filters;
  const query = String(search).trim().toLowerCase();

  return lectures.filter((lecture) => {
    if (courseId !== 'all' && String(lecture.courseId) !== courseId) return false;
    if (subjectId !== 'all' && subjectKey(lecture) !== subjectId) return false;
    if (chapterId !== 'all' && chapterKey(lecture) !== chapterId) return false;

    if (!query) return true;

    const haystack = [
      lecture.title,
      lecture.topic,
      lecture.subjectTitle,
      lecture.chapterTitle,
      lecture.courseTitle,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

/**
 * Flat ordered list with global lecture numbers (1-based).
 * @param {LectureSubjectGroup[]} groups
 */
export function flattenLectureGroups(groups) {
  const rows = [];
  let number = 0;

  for (const subject of groups) {
    for (const chapter of subject.chapters) {
      for (const lecture of chapter.lectures) {
        number += 1;
        rows.push({ lecture, number, subject, chapter });
      }
    }
  }

  return rows;
}

export function findLectureNeighbors(lectures, lectureId) {
  const index = lectures.findIndex((item) => lectureKey(item) === String(lectureId));
  if (index < 0) {
    return { index: -1, previous: null, next: null };
  }
  return {
    index,
    previous: index > 0 ? lectures[index - 1] : null,
    next: index < lectures.length - 1 ? lectures[index + 1] : null,
  };
}
