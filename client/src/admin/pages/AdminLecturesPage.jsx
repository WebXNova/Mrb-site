import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import { adminApi } from '../../api/adminApi';
import { safeAdminErrorMessage } from '../../components/admin/adminSafeMessages';
import AdminHierarchySelectors from '../../components/admin/AdminHierarchySelectors';
import {
  readAdminFiltersFromUrl,
  writeAdminFiltersToUrl,
} from '../utils/adminListFilterQuery.js';
import {
  isLikelyYoutubeWatchUrl,
  normalizeLectureTitle,
  normalizeYoutubeUrlInput,
  parseNonNegativeSortOrder,
} from '../../components/admin/lectureFormUtils';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
import { useAdminHierarchyCascade } from '../../components/admin/useAdminHierarchyCascade';
import { getAdminToken } from '../../auth/session';
import '../styles/admin-courses-dashboard.css';

const LECTURE_FIELD_DEFAULTS = {
  title: '',
  youtubeUrl: '',
  topic: '',
  sortOrder: 0,
  isActive: true,
};

function emptyHierarchyForm(courseId = '', subjectId = '', chapterId = '') {
  return {
    courseId,
    subjectId,
    chapterId,
    ...LECTURE_FIELD_DEFAULTS,
  };
}

function isAbortError(err) {
  return err?.name === 'AbortError';
}

/** @returns {Array<{ id: unknown, title: string }>} */
function sortByTitle(items) {
  return [...items].sort((a, b) =>
    String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' })
  );
}

export default function AdminLecturesPage() {
  const token = getAdminToken();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlHydratedRef = useRef(false);
  const [filtersReady, setFiltersReady] = useState(false);

  const mountedRef = useRef(true);
  const submitLockRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [filters, setFilters] = useState({ search: '', status: 'all' });
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const [errorState, setErrorState] = useState({ list: '', form: '', delete: '' });
  const [successMessage, setSuccessMessage] = useState('');

  const browseCascade = useAdminHierarchyCascade({
    token,
    depth: 3,
    onReset: (reason) => {
      setSuccessMessage('');
      if (reason === 'course' || reason === 'subject') {
        setErrorState((prev) => ({ ...prev, list: '' }));
      }
    },
  });

  const {
    selectedCourseId,
    selectedSubjectId,
    selectedChapterId,
    sortedCourses,
    isLoadingCourses: isLoadingBrowseCourses,
    hierarchyErrors: browseHierarchyErrors,
  } = browseCascade;

  const [lectures, setLectures] = useState([]);
  const [listVersion, setListVersion] = useState(0);
  const [isLoadingLectures, setIsLoadingLectures] = useState(false);

  const [formMode, setFormMode] = useState('create');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingLectureId, setEditingLectureId] = useState(null);
  /** @type {[{ chapterId: number, label: string } | null, function]} */
  const [chapterFallbackOption, setChapterFallbackOption] = useState(null);
  const [formState, setFormState] = useState(emptyHierarchyForm);

  const [formSubjects, setFormSubjects] = useState([]);
  const [formChapters, setFormChapters] = useState([]);
  const [isLoadingFormSubjects, setIsLoadingFormSubjects] = useState(false);
  const [isLoadingFormChapters, setIsLoadingFormChapters] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingLectureId, setDeletingLectureId] = useState(null);

  const sortedFormSubjects = useMemo(() => sortByTitle(formSubjects), [formSubjects]);
  const sortedFormChapters = useMemo(() => sortByTitle(formChapters), [formChapters]);

  const filteredTableLectures = useMemo(() => {
    return [...lectures].sort((a, b) => {
      const o = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
      if (o !== 0) return o;
      return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    });
  }, [lectures]);

  const mutationBusy = isSubmitting || deletingLectureId != null;

  const bumpList = useCallback(() => setListVersion((v) => v + 1), []);

  const resetCreateFormPreserveHierarchy = useCallback((courseId = '', subjectId = '', chapterId = '') => {
    setFormMode('create');
    setShowCreateForm(false);
    setEditingLectureId(null);
    setChapterFallbackOption(null);
    setFormState(emptyHierarchyForm(courseId, subjectId, chapterId));
    setFormSubjects([]);
    setFormChapters([]);
    setErrorState((prev) => ({ ...prev, form: '' }));
  }, []);

  useEffect(() => {
    if (urlHydratedRef.current) return;
    const urlFilters = readAdminFiltersFromUrl(searchParams);
    if (urlFilters.courseId) {
      browseCascade.applyHierarchySelection({
        courseId: urlFilters.courseId,
        subjectId: urlFilters.subjectId,
        chapterId: urlFilters.chapterId,
      });
    }
    if (urlFilters.search || (urlFilters.status && urlFilters.status !== 'all')) {
      setFilters((prev) => ({
        ...prev,
        search: urlFilters.search || prev.search,
        status: urlFilters.status || prev.status,
      }));
    }
    urlHydratedRef.current = true;
    setFiltersReady(true);
  }, [searchParams, browseCascade]);

  useEffect(() => {
    if (!filtersReady) return;
    setSearchParams(
      writeAdminFiltersToUrl(new URLSearchParams(), {
        courseId: selectedCourseId,
        subjectId: selectedSubjectId,
        chapterId: selectedChapterId,
        search: filters.search,
        status: filters.status,
      }),
      { replace: true }
    );
  }, [selectedCourseId, selectedSubjectId, selectedChapterId, filters.search, filters.status, setSearchParams]);

  useEffect(() => {
    if (!filtersReady) {
      return undefined;
    }
    if (!selectedCourseId) {
      setLectures([]);
      setIsLoadingLectures(false);
      return undefined;
    }

    const ac = new AbortController();
    setIsLoadingLectures(true);
    setErrorState((prev) => ({ ...prev, list: '' }));

    adminApi
      .listLectures(
        token,
        {
          courseId: selectedCourseId,
          subjectId: selectedSubjectId || undefined,
          chapterId: selectedChapterId || undefined,
          search: debouncedSearch || undefined,
          status: filters.status !== 'all' ? filters.status : undefined,
          limit: 500,
        },
        { signal: ac.signal }
      )
      .then((res) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        const payload = res?.data;
        const items = Array.isArray(payload) ? payload : payload?.items ?? [];
        setLectures(items);
      })
      .catch((err) => {
        if (!mountedRef.current || ac.signal.aborted || isAbortError(err)) return;
        setLectures([]);
        setErrorState((prev) => ({
          ...prev,
          list: safeAdminErrorMessage(err, 'Unable to load lectures.'),
        }));
      })
      .finally(() => {
        if (mountedRef.current && !ac.signal.aborted) setIsLoadingLectures(false);
      });

    return () => ac.abort();
  }, [
    token,
    selectedCourseId,
    selectedSubjectId,
    selectedChapterId,
    debouncedSearch,
    filters.status,
    listVersion,
    filtersReady,
  ]);

  useEffect(() => {
    if (!formState.courseId) {
      setFormSubjects([]);
      setIsLoadingFormSubjects(false);
      return;
    }
    const ac = new AbortController();
    setIsLoadingFormSubjects(true);
    const includeInactive = formMode === 'edit';

    adminApi
      .subjects(token, formState.courseId, { includeInactive })
      .then((res) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        setFormSubjects(res?.data || []);
      })
      .catch(() => {
        if (!mountedRef.current || ac.signal.aborted) return;
        setFormSubjects([]);
      })
      .finally(() => {
        if (mountedRef.current && !ac.signal.aborted) setIsLoadingFormSubjects(false);
      });

    return () => ac.abort();
  }, [token, formState.courseId, formMode]);

  useEffect(() => {
    if (!formState.subjectId) {
      setFormChapters([]);
      setIsLoadingFormChapters(false);
      return;
    }
    const ac = new AbortController();
    setIsLoadingFormChapters(true);

    adminApi
      .listChapters(token, { subjectId: formState.subjectId }, { signal: ac.signal })
      .then((res) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        setFormChapters(res?.data || []);
      })
      .catch(() => {
        if (!mountedRef.current || ac.signal.aborted) return;
        setFormChapters([]);
      })
      .finally(() => {
        if (mountedRef.current && !ac.signal.aborted) setIsLoadingFormChapters(false);
      });

    return () => ac.abort();
  }, [token, formState.subjectId]);

  /** When hierarchy context changes asynchronously, drop invalid chapter selections. */
  useEffect(() => {
    if (isLoadingFormChapters || !formState.subjectId) return;

    setFormState((prev) => {
      if (!prev.chapterId) return prev;
      const valid = sortedFormChapters.some((ch) => Number(ch.id) === Number(prev.chapterId));
      const fallbackMatches =
        chapterFallbackOption != null &&
        Number(chapterFallbackOption.chapterId) === Number(prev.chapterId);
      if (valid || fallbackMatches) return prev;
      return { ...prev, chapterId: '' };
    });
  }, [sortedFormChapters, chapterFallbackOption, isLoadingFormChapters, formState.subjectId]);

  const browseHierarchyAlert =
    browseHierarchyErrors.courseLoad ||
    browseHierarchyErrors.subjectLoad ||
    browseHierarchyErrors.chapterLoad;

  function onFilterSearchChange(event) {
    setFilters((prev) => ({ ...prev, search: event.target.value }));
  }

  function onFilterStatusChange(event) {
    setFilters((prev) => ({ ...prev, status: event.target.value }));
  }

  function onRetryLoadLectures() {
    setErrorState((prev) => ({ ...prev, list: '' }));
    bumpList();
  }

  function resetLectureFields() {
    setFormState((prev) => ({
      ...prev,
      ...LECTURE_FIELD_DEFAULTS,
    }));
    setChapterFallbackOption(null);
  }

  /** @param {import('react').ChangeEvent<HTMLSelectElement>} event */
  function onFormHierarchyChange(event) {
    const { name, value } = event.target;

    if (name === 'courseId') {
      setChapterFallbackOption(null);
    }
    if (name === 'subjectId') {
      setChapterFallbackOption(null);
    }

    setFormState((prev) => {
      if (name === 'courseId') {
        if (!value) return emptyHierarchyForm();
        return {
          ...prev,
          courseId: value,
          subjectId: '',
          chapterId: '',
          ...LECTURE_FIELD_DEFAULTS,
        };
      }

      if (name === 'subjectId') {
        const nextCourseId = prev.courseId;
        return {
          ...prev,
          courseId: nextCourseId,
          subjectId: value,
          chapterId: '',
          ...LECTURE_FIELD_DEFAULTS,
        };
      }

      if (name === 'chapterId') {
        if (!value) {
          return { ...prev, chapterId: '' };
        }
        const ids = sortedFormChapters.map((ch) => Number(ch.id));
        const nid = Number(value);

        if (ids.length > 0 && !ids.includes(nid)) {
          const fallbackOk =
            chapterFallbackOption != null && nid === Number(chapterFallbackOption.chapterId);
          if (!fallbackOk) {
            return { ...prev, chapterId: '', ...LECTURE_FIELD_DEFAULTS };
          }
        }

        return { ...prev, chapterId: value };
      }

      return prev;
    });

    setErrorState((prev) => ({ ...prev, form: '' }));
  }

  function onFormFieldChange(event) {
    const { name, value, type, checked } = event.target;
    setFormState((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setErrorState((prev) => ({ ...prev, form: '' }));
  }

  function openCreateForm() {
    setShowCreateForm(true);
    setFormMode('create');
    setEditingLectureId(null);
    setChapterFallbackOption(null);
    setErrorState((prev) => ({ ...prev, form: '' }));
    setFormState(emptyHierarchyForm(selectedCourseId, selectedSubjectId, selectedChapterId));
    window.requestAnimationFrame(() => {
      document.getElementById('lecture-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function backToListView() {
    resetCreateFormPreserveHierarchy(selectedCourseId, selectedSubjectId, selectedChapterId);
  }

  const showFormPanel = showCreateForm || formMode === 'edit';

  async function handleEdit(row) {
    setShowCreateForm(false);
    if (mutationBusy || deletingLectureId === row?.id || !row?.id) return;
    setErrorState((prev) => ({ ...prev, form: '', delete: '' }));
    setSuccessMessage('');

    setFormMode('edit');
    setEditingLectureId(row.id);

    try {
      const res = await adminApi.getLecture(token, row.id);
      /** @type {Record<string, unknown>} */
      const lecture = res?.data;
      if (!lecture?.id) {
        setSuccessMessage('');
        resetCreateFormPreserveHierarchy(selectedCourseId, selectedSubjectId, selectedChapterId);
        setErrorState((prev) => ({
          ...prev,
          form: 'The selected lecture is no longer available.',
        }));
        bumpList();
        return;
      }

      const courseIdStr = lecture.courseId != null ? String(lecture.courseId) : '';
      const subjectIdStr = lecture.subjectId != null ? String(lecture.subjectId) : '';
      const chapterIdStr = lecture.chapterId != null ? String(lecture.chapterId) : '';

      setChapterFallbackOption(
        lecture.chapterId != null && lecture.chapterTitle != null
          ? { chapterId: Number(lecture.chapterId), label: String(lecture.chapterTitle || '') || `Chapter #${chapterIdStr}` }
          : lecture.chapterId != null
            ? { chapterId: Number(lecture.chapterId), label: `Chapter #${chapterIdStr}` }
            : null
      );

      setFormState({
        courseId: courseIdStr,
        subjectId: subjectIdStr,
        chapterId: chapterIdStr,
        title: lecture.title || '',
        youtubeUrl: lecture.youtubeUrl != null ? String(lecture.youtubeUrl) : '',
        topic: lecture.topic != null ? String(lecture.topic) : '',
        sortOrder: Number(lecture.sortOrder ?? 0),
        isActive: Boolean(lecture.isActive),
      });
    } catch (err) {
      resetCreateFormPreserveHierarchy(selectedCourseId, selectedSubjectId, selectedChapterId);
      const safe = safeAdminErrorMessage(err, 'Unable to load lecture details.');
      setErrorState((prev) => ({ ...prev, form: safe }));
      if (err?.status === 404) bumpList();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitLockRef.current || mutationBusy || deletingLectureId) return;

    setErrorState((prev) => ({ ...prev, form: '' }));
    setSuccessMessage('');

    const title = normalizeLectureTitle(formState.title);
    const youtubeUrl = normalizeYoutubeUrlInput(formState.youtubeUrl);
    const topicRaw = normalizeYoutubeUrlInput(formState.topic);
    const topic = topicRaw === '' ? null : topicRaw;
    const sortOrder = parseNonNegativeSortOrder(formState.sortOrder);
    const chapterId = Number(formState.chapterId);

    if (!formState.courseId || !formState.subjectId) {
      setErrorState((prev) => ({
        ...prev,
        form: 'Course and subject are required.',
      }));
      return;
    }
    if (!chapterId) {
      setErrorState((prev) => ({
        ...prev,
        form: 'Selected chapter is unavailable.',
      }));
      return;
    }

    const chapterIds = sortedFormChapters.map((c) => Number(c.id));
    const chapterOk =
      chapterIds.includes(chapterId) ||
      (chapterFallbackOption != null && Number(chapterFallbackOption.chapterId) === chapterId);

    if (!chapterOk) {
      setErrorState((prev) => ({
        ...prev,
        form: 'Selected chapter is unavailable.',
      }));
      return;
    }

    if (!title || title.length < 3) {
      setErrorState((prev) => ({
        ...prev,
        form: 'Lecture title must be at least 3 characters after trimming.',
      }));
      return;
    }
    if (!isLikelyYoutubeWatchUrl(youtubeUrl)) {
      setErrorState((prev) => ({
        ...prev,
        form: 'Please enter a YouTube watch URL (youtube.com/watch?v=… or youtu.be/…).',
      }));
      return;
    }
    if (sortOrder == null) {
      setErrorState((prev) => ({
        ...prev,
        form: 'Sort order must be a whole number of 0 or greater.',
      }));
      return;
    }

    const payload = {
      chapterId,
      title,
      youtubeUrl,
      topic,
      sortOrder,
      isActive: formState.isActive,
    };

    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      if (formMode === 'edit' && editingLectureId) {
        await adminApi.updateLecture(token, editingLectureId, payload);
        setSuccessMessage('Lecture updated successfully.');
      } else {
        await adminApi.createLecture(token, payload);
        setSuccessMessage('Lecture created successfully.');
      }

      resetCreateFormPreserveHierarchy(selectedCourseId, selectedSubjectId, selectedChapterId);
      bumpList();
    } catch (err) {
      const fallback =
        formMode === 'edit' && editingLectureId ? 'Lecture update failed.' : 'Unable to create lecture.';
      setErrorState((prev) => ({
        ...prev,
        form: safeAdminErrorMessage(err, fallback),
      }));
    } finally {
      submitLockRef.current = false;
      if (mountedRef.current) setIsSubmitting(false);
    }
  }

  async function handleDelete(lectureId) {
    if (mutationBusy || deletingLectureId === lectureId) return;
    if (!window.confirm('Remove this lecture? This cannot be undone from the panel.')) return;

    setErrorState((prev) => ({ ...prev, delete: '' }));
    setSuccessMessage('');
    setDeletingLectureId(lectureId);

    try {
      await adminApi.deleteLecture(token, lectureId);
      setSuccessMessage('Lecture removed successfully.');
      if (editingLectureId === lectureId) resetCreateFormPreserveHierarchy(selectedCourseId, selectedSubjectId, selectedChapterId);
      bumpList();
    } catch (err) {
      setErrorState((prev) => ({
        ...prev,
        delete: safeAdminErrorMessage(err, 'Unable to delete lecture.'),
      }));
    } finally {
      if (mountedRef.current) setDeletingLectureId(null);
    }
  }

  function handleCancelEdit() {
    backToListView();
  }

  /** Show inactive chapter option when editing a lecture tied to something not in the active-only list */
  const showChapterFallbackOption =
    chapterFallbackOption != null &&
    formState.chapterId &&
    !sortedFormChapters.some((c) => Number(c.id) === Number(formState.chapterId));

  const formHierarchyLoading =
    Boolean(formState.courseId && isLoadingFormSubjects) ||
    Boolean(formState.subjectId && isLoadingFormChapters);

  return (
    <section className="admin-page admin-page--courses">
      <header className="admin-courses-page-header">
        <div>
          <h1 className="admin-courses-page-header__title">Lecture management</h1>
          <p className="admin-courses-page-header__subtitle">
            Lectures attach to chapters only (Course → Subject → Chapter → Lecture). Browse your catalog or add a new
            lecture when you are ready.
          </p>
        </div>
        <div className="admin-courses-page-header__actions">
          {!showFormPanel ? (
            <button type="button" className="btn--course-primary" onClick={openCreateForm}>
              <AddIcon fontSize="small" style={{ marginRight: 6, verticalAlign: -3 }} aria-hidden />
              New lecture
            </button>
          ) : (
            <button type="button" className="btn--course-secondary" onClick={backToListView}>
              Back to list
            </button>
          )}
        </div>
      </header>

      {!showFormPanel ? (
        <>
      <section className="admin-card">
        <h3 className="heading-4">Hierarchy filters</h3>
        <div className="admin-form-grid" style={{ marginTop: '1rem' }}>
          <AdminHierarchySelectors
            cascade={browseCascade}
            depth={3}
            disabled={mutationBusy}
            idPrefix={{ course: 'browseCourse', subject: 'browseSubject', chapter: 'browseChapter' }}
          />

          <div className="admin-field">
            <label htmlFor="lectureSearch">Search</label>
            <input
              id="lectureSearch"
              type="search"
              value={filters.search}
              onChange={onFilterSearchChange}
              placeholder="Title, topic, course, chapter…"
              disabled={!selectedCourseId || mutationBusy}
              autoComplete="off"
            />
          </div>

          <div className="admin-field">
            <label htmlFor="lectureStatus">Status</label>
            <select
              id="lectureStatus"
              value={filters.status}
              onChange={onFilterStatusChange}
              disabled={!selectedCourseId || mutationBusy}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </section>

      {browseHierarchyAlert ? (
        <p className="admin-error" role="alert" style={{ marginTop: '1rem' }}>
          {browseHierarchyAlert}
        </p>
      ) : null}

      {errorState.list ? (
        <div role="alert" style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <p className="admin-error" style={{ margin: 0 }}>
            {errorState.list}
          </p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetryLoadLectures}>
            Retry
          </button>
        </div>
      ) : null}
      {errorState.delete ? (
        <p className="admin-error" role="alert" style={{ marginTop: '1rem' }}>
          {errorState.delete}
        </p>
      ) : null}
      {successMessage ? (
        <p className="admin-success" role="status" style={{ marginTop: '1rem' }}>
          {successMessage}
        </p>
      ) : null}

      <section className="admin-card" style={{ marginTop: '1rem' }}>
        <h3 className="heading-4">Lectures</h3>

        {!selectedCourseId ? (
          <p className="admin-muted" style={{ marginTop: '0.75rem' }}>
            Select a course to browse lectures under that course.
          </p>
        ) : isLoadingLectures ? (
          <p className="admin-muted" style={{ marginTop: '0.75rem' }}>
            Loading lectures…
          </p>
        ) : filteredTableLectures.length === 0 ? (
          <p className="admin-muted" style={{ marginTop: '0.75rem' }}>
            {debouncedSearch.trim()
              ? 'No lectures match your filters.'
              : 'No lectures match the current hierarchy filters.'}
          </p>
        ) : (
          <div className="admin-table-wrap admin-lectures-table" style={{ marginTop: '1rem' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Lecture Title</th>
                  <th scope="col">Course</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Chapter</th>
                  <th scope="col">Topic</th>
                  <th scope="col">Active</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTableLectures.map((lecture) => {
                  const chapterLabel =
                    lecture.chapterTitle || (lecture.chapterId != null ? `#${lecture.chapterId}` : '—');

                  return (
                    <tr key={lecture.id}>
                      <td>{lecture.sortOrder ?? 0}</td>
                      <td>{lecture.title || '—'}</td>
                      <td>{lecture.courseTitle || '—'}</td>
                      <td>{lecture.subjectTitle ?? '—'}</td>
                      <td>{chapterLabel}</td>
                      <td>{lecture.topic || '—'}</td>
                      <td>{lecture.isActive ? 'Yes' : 'No'}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => handleEdit(lecture)}
                            disabled={mutationBusy || isLoadingLectures}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={() => handleDelete(lecture.id)}
                            disabled={mutationBusy || isLoadingLectures || deletingLectureId === lecture.id}
                          >
                            {deletingLectureId === lecture.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
        </>
      ) : null}

      {showFormPanel ? (
      <section id="lecture-form-panel" className="admin-card admin-lectures-form" style={{ marginTop: '1rem' }}>
        <h3 className="heading-4">{formMode === 'edit' ? 'Edit lecture' : 'Create lecture'}</h3>

        <form className="admin-form-grid admin-lectures-form__grid" style={{ marginTop: '1rem' }} onSubmit={handleSubmit}>
          <div className="admin-field admin-lectures-form__field">
            <label htmlFor="formCourseId">Course</label>
            <select
              id="formCourseId"
              name="courseId"
              value={formState.courseId}
              onChange={onFormHierarchyChange}
              required
              disabled={mutationBusy || isLoadingBrowseCourses || !sortedCourses.length}
              aria-required="true"
            >
              <option value="">Select a course…</option>
              {sortedCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} · #{c.id}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field admin-lectures-form__field">
            <label htmlFor="formSubjectId">Subject</label>
            <select
              id="formSubjectId"
              name="subjectId"
              value={formState.subjectId}
              onChange={onFormHierarchyChange}
              required
              disabled={mutationBusy || !formState.courseId || isLoadingFormSubjects}
              aria-required="true"
            >
              <option value="">
                {!formState.courseId
                  ? 'Select a course first'
                  : isLoadingFormSubjects
                    ? 'Loading subjects…'
                    : sortedFormSubjects.length
                      ? 'Select a subject…'
                      : 'No subjects under this course'}
              </option>
              {sortedFormSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · #{s.id}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field admin-lectures-form__field">
            <label htmlFor="formChapterId">Chapter</label>
            <select
              id="formChapterId"
              name="chapterId"
              value={formState.chapterId}
              onChange={onFormHierarchyChange}
              required
              disabled={mutationBusy || !formState.subjectId || isLoadingFormChapters}
              aria-required="true"
            >
              <option value="">
                {!formState.subjectId
                  ? 'Select a subject first'
                  : isLoadingFormChapters
                    ? 'Loading chapters…'
                    : sortedFormChapters.length || showChapterFallbackOption
                      ? 'Select a chapter…'
                      : 'No chapters — use Chapters admin'}
              </option>
              {showChapterFallbackOption && chapterFallbackOption ? (
                <option value={String(chapterFallbackOption.chapterId)}>
                  {chapterFallbackOption.label} (may be inactive or archived)
                </option>
              ) : null}
              {sortedFormChapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title} · #{ch.id}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field admin-lectures-form__field">
            <label htmlFor="formTitle">Lecture title</label>
            <input
              id="formTitle"
              name="title"
              value={formState.title}
              onChange={onFormFieldChange}
              disabled={mutationBusy}
              required
              minLength={3}
              autoComplete="off"
            />
          </div>

          <div className="admin-field admin-lectures-form__field">
            <label htmlFor="formYoutubeUrl">YouTube URL</label>
            <input
              id="formYoutubeUrl"
              name="youtubeUrl"
              value={formState.youtubeUrl}
              onChange={onFormFieldChange}
              disabled={mutationBusy}
              required
              placeholder="https://www.youtube.com/watch?v=..."
              autoComplete="off"
            />
          </div>

          <div className="admin-field admin-lectures-form__field">
            <label htmlFor="formTopic">Topic</label>
            <input
              id="formTopic"
              name="topic"
              value={formState.topic}
              onChange={onFormFieldChange}
              disabled={mutationBusy}
              autoComplete="off"
            />
          </div>

          <div className="admin-field admin-lectures-form__field">
            <label htmlFor="formSortOrder">Sort order</label>
            <input
              id="formSortOrder"
              name="sortOrder"
              type="number"
              min={0}
              step={1}
              value={formState.sortOrder}
              onChange={onFormFieldChange}
              disabled={mutationBusy}
              required
            />
          </div>

          <label className="admin-field admin-lectures-form__toggle" htmlFor="formIsActive">
            <input id="formIsActive" name="isActive" type="checkbox" checked={formState.isActive} onChange={onFormFieldChange} disabled={mutationBusy} />
            Active
          </label>

          {errorState.form ? (
            <p className="admin-error" role="alert" style={{ gridColumn: '1 / -1' }}>
              {errorState.form}
            </p>
          ) : null}

          <div className="admin-actions" style={{ gridColumn: '1 / -1' }}>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={mutationBusy || formHierarchyLoading}
            >
              {isSubmitting ? 'Saving…' : formMode === 'edit' ? 'Update lecture' : 'Create lecture'}
            </button>
            {formMode === 'edit' ? (
              <button type="button" className="btn btn--secondary" onClick={handleCancelEdit} disabled={mutationBusy}>
                Cancel edit
              </button>
            ) : (
              <button type="button" className="btn btn--secondary" onClick={backToListView} disabled={mutationBusy}>
                Cancel
              </button>
            )}
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => resetLectureFields()}
              disabled={mutationBusy || formMode === 'edit'}
            >
              Reset fields
            </button>
          </div>
        </form>
      </section>
      ) : null}
    </section>
  );
}
