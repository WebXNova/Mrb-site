/**
 * Map API failures to safe admin-facing copy. Never expose raw backend messages.
 * @param {unknown} err
 * @param {string} fallback
 */
export function safeAdminErrorMessage(err, fallback) {
  const status = err && typeof err === 'object' ? err.status : null;

  if (status === 401 || status === 403) {
    return 'Your session expired or you do not have access. Please sign in again.';
  }
  if (status === 404) {
    return 'The selected item is no longer available.';
  }
  if (status === 409) {
    return 'This action could not be completed due to a conflict. Refresh and try again.';
  }
  if (status === 422) {
    return 'Please check your input and try again.';
  }
  if (status === 429) {
    return 'Too many requests. Please wait and try again.';
  }

  return fallback;
}

/** @param {string | null | undefined} iso */
export function formatAdminDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Client-side chapter filters (search + status). The list API scopes by `status` (active/archived/all);
 * this helper applies additional search narrowing.
 * @param {Array<Record<string, unknown>>} chapters
 * @param {{ search?: string, status?: 'active' | 'archived' | 'all' }} filters
 */
export function filterChapters(chapters, { search = '', status = 'active' } = {}) {
  const query = String(search || '').trim().toLowerCase();

  return (chapters || []).filter((chapter) => {
    const isActive = Boolean(chapter?.isActive);

    if (status === 'active' && !isActive) return false;
    if (status === 'archived' && isActive) return false;

    if (query) {
      const haystack = `${chapter?.title || ''} ${chapter?.description || ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

/**
 * @param {Array<Record<string, unknown>>} lectures
 * @param {{ search?: string, status?: 'active' | 'inactive' | 'all' }} opts
 */
export function filterLecturesClient(lectures, { search = '', status = 'active' } = {}) {
  const query = String(search || '').trim().toLowerCase();

  return (lectures || []).filter((lecture) => {
    const isActive = Boolean(lecture?.isActive);

    if (status === 'active' && !isActive) return false;
    if (status === 'inactive' && isActive) return false;

    if (query) {
      const haystack = `${lecture?.title ?? ''} ${lecture?.topic ?? ''} ${lecture?.courseTitle ?? ''} ${lecture?.subjectTitle ?? ''} ${lecture?.chapterTitle ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}
