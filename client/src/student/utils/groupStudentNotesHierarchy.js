/**
 * Organize flat note groups into course-wide → subject → chapter → lecture hierarchy.
 */

function noteMatchesSearch(note, query) {
  if (!query) return true;
  const haystack = `${note.title || ''} ${note.description || ''}`.toLowerCase();
  return haystack.includes(query);
}

function ensureSubject(subjects, subjectId, title) {
  const key = String(subjectId);
  if (!subjects.has(key)) {
    subjects.set(key, {
      id: subjectId,
      title: title || `Subject ${subjectId}`,
      subjectNotes: [],
      chapters: new Map(),
    });
  }
  return subjects.get(key);
}

function ensureChapter(subject, chapterId, title) {
  const key = String(chapterId);
  if (!subject.chapters.has(key)) {
    subject.chapters.set(key, {
      id: chapterId,
      title: title || `Chapter ${chapterId}`,
      chapterNotes: [],
      lectures: new Map(),
    });
  }
  return subject.chapters.get(key);
}

function ensureLecture(chapter, lectureId, title) {
  const key = String(lectureId);
  if (!chapter.lectures.has(key)) {
    chapter.lectures.set(key, {
      id: lectureId,
      title: title || `Lecture ${lectureId}`,
      notes: [],
    });
  }
  return chapter.lectures.get(key);
}

function serializeSubject(subject) {
  return {
    id: subject.id,
    title: subject.title,
    subjectNotes: subject.subjectNotes,
    chapters: Array.from(subject.chapters.values())
      .map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        chapterNotes: chapter.chapterNotes,
        lectures: Array.from(chapter.lectures.values()).sort((a, b) =>
          String(a.title).localeCompare(String(b.title))
        ),
      }))
      .sort((a, b) => String(a.title).localeCompare(String(b.title))),
  };
}

function countHierarchyNotes(hierarchy) {
  let total = hierarchy.courseWide.length;
  for (const subject of hierarchy.subjects) {
    total += subject.subjectNotes.length;
    for (const chapter of subject.chapters) {
      total += chapter.chapterNotes.length;
      for (const lecture of chapter.lectures) {
        total += lecture.notes.length;
      }
    }
  }
  return total;
}

/**
 * @param {Array<{ notes?: Array, scopeLevel?: string, subjectId?: number|null, chapterId?: number|null, lectureId?: number|null, scopeLabel?: string }>} groups
 */
export function buildNotesHierarchy(groups) {
  const courseWide = [];
  const subjects = new Map();

  for (const group of groups || []) {
    for (const note of group.notes || []) {
      const scope = note.scope || {};
      const level = scope.level || group.scopeLevel || 'course';
      const subjectId = scope.subjectId ?? group.subjectId ?? null;
      const chapterId = scope.chapterId ?? group.chapterId ?? null;
      const lectureId = scope.lectureId ?? group.lectureId ?? null;

      if (level === 'course' || subjectId == null) {
        courseWide.push(note);
        continue;
      }

      const subject = ensureSubject(
        subjects,
        subjectId,
        scope.subjectTitle || group.scopeLabel?.split(' → ')[0]
      );

      if (level === 'subject' && chapterId == null && lectureId == null) {
        subject.subjectNotes.push(note);
        continue;
      }

      if (chapterId == null) {
        subject.subjectNotes.push(note);
        continue;
      }

      const chapter = ensureChapter(subject, chapterId, scope.chapterTitle);

      if (level === 'chapter' && lectureId == null) {
        chapter.chapterNotes.push(note);
        continue;
      }

      if (lectureId == null) {
        chapter.chapterNotes.push(note);
        continue;
      }

      const lecture = ensureLecture(chapter, lectureId, scope.lectureTitle);
      lecture.notes.push(note);
    }
  }

  return {
    courseWide,
    subjects: Array.from(subjects.values())
      .map(serializeSubject)
      .sort((a, b) => String(a.title).localeCompare(String(b.title))),
  };
}

/**
 * @param {ReturnType<typeof buildNotesHierarchy>} hierarchy
 * @param {string} search
 */
export function filterNotesHierarchy(hierarchy, search) {
  const query = String(search || '')
    .trim()
    .toLowerCase();
  if (!query) return hierarchy;

  const courseWide = hierarchy.courseWide.filter((note) => noteMatchesSearch(note, query));
  const subjects = hierarchy.subjects
    .map((subject) => {
      const subjectNotes = subject.subjectNotes.filter((note) => noteMatchesSearch(note, query));
      const chapters = subject.chapters
        .map((chapter) => {
          const chapterNotes = chapter.chapterNotes.filter((note) => noteMatchesSearch(note, query));
          const lectures = chapter.lectures
            .map((lecture) => ({
              ...lecture,
              notes: lecture.notes.filter((note) => noteMatchesSearch(note, query)),
            }))
            .filter((lecture) => lecture.notes.length > 0);
          if (!chapterNotes.length && !lectures.length) return null;
          return { ...chapter, chapterNotes, lectures };
        })
        .filter(Boolean);
      if (!subjectNotes.length && !chapters.length) return null;
      return { ...subject, subjectNotes, chapters };
    })
    .filter(Boolean);

  return { courseWide, subjects };
}

export function countNotesInHierarchy(hierarchy) {
  return countHierarchyNotes(hierarchy);
}
