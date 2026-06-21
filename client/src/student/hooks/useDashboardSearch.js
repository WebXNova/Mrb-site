import { useMemo } from 'react';

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function matchQuery(text, query) {
  const hay = normalizeText(text);
  const needle = normalizeText(query);
  return needle.length > 0 && hay.includes(needle);
}

/**
 * Client-side dashboard search across courses, lectures, tests, results, notifications.
 */
export function useDashboardSearch(data, query) {
  return useMemo(() => {
    const q = normalizeText(query);
    if (!q || !data) return [];

    const results = [];

    (data.courses || []).forEach((course) => {
      const title = course.title || course.name;
      if (matchQuery(title, q)) {
        results.push({
          id: `course-${course.id || title}`,
          type: 'Course',
          label: title || 'Course',
          href: '/dashboard/my-courses',
          icon: 'book-open',
        });
      }
    });

    (data.lectures || []).forEach((lecture) => {
      const title = lecture.title || lecture.name;
      if (matchQuery(title, q) || matchQuery(lecture.subject, q)) {
        results.push({
          id: `lecture-${lecture.id || title}`,
          type: 'Lecture',
          label: title || 'Lecture',
          href: lecture.id ? `/dashboard/lectures/${lecture.id}` : '/dashboard/lectures',
          icon: 'video',
        });
      }
    });

    (data.tests || []).forEach((test) => {
      if (matchQuery(test.title, q) || matchQuery(test.subject, q)) {
        results.push({
          id: `test-${test.id || test.slug || test.title}`,
          type: 'Test',
          label: test.title || 'Test',
          href: test.slug ? `/tests/${test.slug}` : '/dashboard/tests',
          icon: 'clipboard-check',
        });
      }
    });

    (data.results || []).forEach((result) => {
      if (matchQuery(result.testTitle, q) || matchQuery(result.subject, q)) {
        results.push({
          id: `result-${result.attemptId || result.testId}`,
          type: 'Result',
          label: result.testTitle || 'Test result',
          href: `/dashboard/tests/${result.testId || 'test'}/results/${result.attemptId}`,
          icon: 'bar-chart',
        });
      }
    });

    (data.notifications || []).forEach((note) => {
      if (matchQuery(note.title, q) || matchQuery(note.message, q)) {
        results.push({
          id: `note-${note.id}`,
          type: 'Notification',
          label: note.title || note.message || 'Notification',
          href: '/dashboard/notifications',
          icon: 'bell',
        });
      }
    });

    return results.slice(0, 8);
  }, [data, query]);
}
