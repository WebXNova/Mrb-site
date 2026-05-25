import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import {
  filterChapters,
  formatAdminDate,
  safeAdminErrorMessage,
} from '../../components/admin/adminSafeMessages';
import {
  normalizeChapterTitleUx,
  parseChapterOrderUx,
  safeChapterMutationError,
  trimChapterDescriptionUx,
  validateChapterEditFormUx,
  validateChapterFormUx,
} from '../../components/admin/chapterFormUtils';
import AdminChapterEditDialog from '../../components/admin/AdminChapterEditDialog';
import AdminChapterFormFields from '../../components/admin/AdminChapterFormFields';
import { AdminChapterTableRow } from '../../components/admin/AdminChapterTableRow';
import { useAdminHierarchyCascade } from '../../components/admin/useAdminHierarchyCascade';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
import './AdminChaptersPage.css';

const EMPTY_CREATE_FORM = {
  courseId: '',
  subjectId: '',
  title: '',
  description: '',
  orderIndex: 0,
  isActive: true,
};

const EMPTY_EDIT_FORM = {
  title: '',
  description: '',
  orderIndex: 0,
};

/** @typedef {{ course: string, subject: string }} LockedTitles */

function isAbortError(err) {
  return err?.name === 'AbortError';
}

export default function AdminChaptersPage() {
  const token = getAdminToken();

  const [errorState, setErrorState] = useState({ list: '', form: '', archive: '' });
  const [successMessage, setSuccessMessage] = useState('');
  const [chapterListVersion, setChapterListVersion] = useState(0);

  const filterCascade = useAdminHierarchyCascade({
    token,
    depth: 2,
    subjectsIncludeInactive: true,
    chapterRefetchKey: chapterListVersion,
    onReset: (reason) => {
      setSuccessMessage('');
      if (reason === 'course') {
        setErrorState((prev) => ({ ...prev, list: '', archive: '', form: '' }));
      }
      if (reason === 'subject') {
        setErrorState((prev) => ({ ...prev, list: '', archive: '' }));
      }
    },
  });

  const {
    selectedCourseId,
    selectedSubjectId,
    selectCourse,
    selectSubject,
    sortedCourses,
    sortedSubjects,
    isLoadingCourses,
    isLoadingSubjects,
    hierarchyErrors: filterHierarchyErrors,
    applyHierarchySelection,
  } = filterCascade;

  const [formSubjects, setFormSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);

  const [filters, setFilters] = useState({ search: '', status: 'active' });
  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const [formMode, setFormMode] = useState('create');
  const [editingChapterId, setEditingChapterId] = useState(null);
  const [lockedEditTitles, setLockedEditTitles] = useState(
    /** @type {LockedTitles} */ ({ course: '', subject: '' })
  );
  const [createFormState, setCreateFormState] = useState(EMPTY_CREATE_FORM);
  const [editFormState, setEditFormState] = useState(EMPTY_EDIT_FORM);

  const [isLoadingFormSubjects, setIsLoadingFormSubjects] = useState(false);
  const [isFetchingChapterDetail, setIsFetchingChapterDetail] = useState(false);

  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [archivingChapterId, setArchivingChapterId] = useState(null);

  const mountedRef = useRef(true);
  const submitLockRef = useRef(false);
  const editFetchAbortRef = useRef(null);
  const submitRefreshAbortRef = useRef(null);
  const editDialogRef = useRef(/** @type {HTMLDialogElement | null} */ (null));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      editFetchAbortRef.current?.abort();
      submitRefreshAbortRef.current?.abort();
    };
  }, []);

  const sortedFormSubjects = useMemo(
    () =>
      [...formSubjects].sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))),
    [formSubjects]
  );

  const filteredChapters = useMemo(
    () =>
      filterChapters(chapters, {
        search: debouncedSearch,
        status: filters.status,
      }),
    [chapters, debouncedSearch, filters.status]
  );

  const sortedTableChapters = useMemo(
    () =>
      [...filteredChapters].sort((a, b) => {
        const orderDiff = Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return String(a.title || '').localeCompare(String(b.title || ''));
      }),
    [filteredChapters]
  );

  const resetCreateForm = useCallback((courseId = '', subjectId = '') => {
    setCreateFormState({
      ...EMPTY_CREATE_FORM,
      courseId: courseId ? String(courseId) : '',
      subjectId: subjectId ? String(subjectId) : '',
    });
    setFormSubjects([]);
    setErrorState((prev) => ({ ...prev, form: '' }));
  }, []);

  const resetEditForm = useCallback(() => {
    setFormMode('create');
    setEditingChapterId(null);
    setLockedEditTitles({ course: '', subject: '' });
    setEditFormState(EMPTY_EDIT_FORM);
    setIsFetchingChapterDetail(false);
    setErrorState((prev) => ({ ...prev, form: '' }));
  }, []);

  const cancelEditUi = useCallback(() => {
    editFetchAbortRef.current?.abort();
    editFetchAbortRef.current = null;
    submitRefreshAbortRef.current?.abort();
    submitRefreshAbortRef.current = null;
    resetEditForm();
    resetCreateForm(selectedCourseId, selectedSubjectId);
  }, [resetEditForm, resetCreateForm, selectedCourseId, selectedSubjectId]);

  const bumpChapterList = useCallback(() => {
    setChapterListVersion((v) => v + 1);
  }, []);

  const retryChapterList = useCallback(() => {
    setErrorState((prev) => ({ ...prev, list: '' }));
    bumpChapterList();
  }, [bumpChapterList]);

  useEffect(() => {
    if (!selectedSubjectId) {
      setChapters([]);
      setIsLoadingChapters(false);
      return;
    }

    const ac = new AbortController();
    setIsLoadingChapters(true);
    setErrorState((prev) => ({ ...prev, list: '' }));

    adminApi
      .listChapters(token, { subjectId: selectedSubjectId, status: filters.status }, { signal: ac.signal })
      .then((res) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        setChapters(res?.data || []);
      })
      .catch((err) => {
        if (!mountedRef.current || ac.signal.aborted || isAbortError(err)) return;
        setChapters([]);
        const message = safeAdminErrorMessage(err, 'Unable to load chapters.');
        if (err?.status === 404) {
          setErrorState((prev) => ({
            ...prev,
            list: 'The selected subject is no longer available.',
          }));
          applyHierarchySelection({ subjectId: '' });
        } else {
          setErrorState((prev) => ({ ...prev, list: message }));
        }
      })
      .finally(() => {
        if (mountedRef.current && !ac.signal.aborted) setIsLoadingChapters(false);
      });

    return () => ac.abort();
  }, [selectedSubjectId, filters.status, token, chapterListVersion, applyHierarchySelection]);

  /** Subjects dropdown for create path only — edit uses authoritative hierarchy from GET chapter */
  useEffect(() => {
    if (formMode !== 'create') {
      return;
    }

    if (!createFormState.courseId) {
      setFormSubjects([]);
      setIsLoadingFormSubjects(false);
      return;
    }

    const ac = new AbortController();
    setIsLoadingFormSubjects(true);

    adminApi
      .subjects(token, createFormState.courseId, { includeInactive: true })
      .then((res) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        setFormSubjects(res?.data || []);
      })
      .catch((err) => {
        if (!mountedRef.current || ac.signal.aborted || isAbortError(err)) return;
        setFormSubjects([]);
      })
      .finally(() => {
        if (mountedRef.current && !ac.signal.aborted) setIsLoadingFormSubjects(false);
      });

    return () => ac.abort();
  }, [createFormState.courseId, formMode, token]);

  function clearBrowseOnHierarchyChange() {
    setChapters([]);
    setIsLoadingChapters(true);
    setSuccessMessage('');
    setErrorState((prev) => ({ ...prev, list: '', archive: '' }));
    if (formMode === 'edit') {
      cancelEditUi();
    }
  }

  function onFilterCourseChange(event) {
    const nextCourseId = event.target.value;
    clearBrowseOnHierarchyChange();
    resetCreateForm(nextCourseId, '');
    selectCourse(nextCourseId);
  }

  function onFilterSubjectChange(event) {
    const nextSubjectId = event.target.value;
    clearBrowseOnHierarchyChange();
    selectSubject(nextSubjectId);
    setCreateFormState((prev) => ({
      ...prev,
      courseId: selectedCourseId,
      subjectId: nextSubjectId,
    }));
  }

  function onFilterSearchChange(event) {
    setFilters((prev) => ({ ...prev, search: event.target.value }));
  }

  function onFilterStatusChange(event) {
    setFilters((prev) => ({ ...prev, status: event.target.value }));
  }

  function onCreateFormChange(event) {
    const { name, value, type, checked } = event.target;
    setCreateFormState((prev) => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'courseId') {
        next.subjectId = '';
      }
      return next;
    });
    setErrorState((prev) => ({ ...prev, form: '' }));
  }

  function onEditFormChange(event) {
    const { name, value } = event.target;
    if (name === 'courseId' || name === 'subjectId' || name === 'isActive') {
      return;
    }
    setEditFormState((prev) => ({ ...prev, [name]: value }));
    setErrorState((prev) => ({ ...prev, form: '' }));
  }

  async function handleEditChapter(chapter) {
    if (!chapter?.id || isSubmitting || archivingChapterId) return;

    editFetchAbortRef.current?.abort();
    const ac = new AbortController();
    editFetchAbortRef.current = ac;

    setErrorState((prev) => ({ ...prev, form: '', archive: '' }));
    setSuccessMessage('');
    setFormMode('edit');
    setEditingChapterId(chapter.id);
    setIsFetchingChapterDetail(true);
    setLockedEditTitles({
      course: typeof chapter.courseTitle === 'string' ? chapter.courseTitle : '',
      subject: typeof chapter.subjectTitle === 'string' ? chapter.subjectTitle : '',
    });

    try {
      const res = await adminApi.getChapter(token, chapter.id, { signal: ac.signal });
      const row = res?.data;
      if (!mountedRef.current || ac.signal.aborted) return;

      if (!row) {
        setErrorState((prev) => ({
          ...prev,
          form: 'Chapter no longer exists.',
        }));
        cancelEditUi();
        bumpChapterList();
        return;
      }

      setLockedEditTitles({
        course: String(row.courseTitle ?? ''),
        subject: String(row.subjectTitle ?? ''),
      });

      setEditFormState({
        title: row.title || '',
        description: row.description || '',
        orderIndex: Number(row.orderIndex ?? 0),
      });
    } catch (err) {
      if (isAbortError(err)) return;
      setErrorState((prev) => ({
        ...prev,
        form: safeChapterMutationError(err, 'Unable to load chapter details.', { context: 'fetchOne' }),
      }));
      if (err?.status === 404) {
        cancelEditUi();
        bumpChapterList();
      }
    } finally {
      if (editFetchAbortRef.current === ac) editFetchAbortRef.current = null;
      if (mountedRef.current) setIsFetchingChapterDetail(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();

    const isEditing = Boolean(formMode === 'edit' && editingChapterId);

    if (
      submitLockRef.current ||
      isSubmitting ||
      archivingChapterId ||
      isFetchingChapterDetail ||
      (!isEditing && createFormState.courseId && isLoadingFormSubjects)
    ) {
      return;
    }

    setErrorState((prev) => ({ ...prev, form: '' }));
    setSuccessMessage('');

    const activeForm = isEditing ? editFormState : createFormState;
    const normalizedTitle = normalizeChapterTitleUx(activeForm.title);
    const description = trimChapterDescriptionUx(activeForm.description);
    const orderIndex = parseChapterOrderUx(activeForm.orderIndex);

    const uxReject = isEditing
      ? validateChapterEditFormUx({ normalizedTitle, orderIndex, descriptionNormalized: description })
      : validateChapterFormUx({
          courseId: createFormState.courseId,
          subjectId: createFormState.subjectId,
          normalizedTitle,
          orderIndex,
          subjectsLoadedCount: sortedFormSubjects.length,
          subjectOptions: sortedFormSubjects,
          descriptionNormalized: description,
          subjectsResolved: Boolean(createFormState.courseId) && !isLoadingFormSubjects,
        });
    if (uxReject) {
      setErrorState((prev) => ({ ...prev, form: uxReject.message }));
      return;
    }

    const subjectId = Number(createFormState.subjectId);
    const courseId = Number(createFormState.courseId);

    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      if (isEditing && editingChapterId) {
        await adminApi.updateChapter(token, editingChapterId, {
          title: normalizedTitle,
          description,
          orderIndex,
        });
        setSuccessMessage('Chapter updated successfully.');
        submitRefreshAbortRef.current?.abort();
        const refreshAc = new AbortController();
        submitRefreshAbortRef.current = refreshAc;
        try {
          const refreshed = await adminApi.getChapter(token, editingChapterId, { signal: refreshAc.signal });
          const row = refreshed?.data;
          if (mountedRef.current && !refreshAc.signal.aborted && row) {
            setLockedEditTitles({
              course: String(row.courseTitle ?? ''),
              subject: String(row.subjectTitle ?? ''),
            });
            setEditFormState({
              title: row.title || '',
              description: row.description || '',
              orderIndex: Number(row.orderIndex ?? 0),
            });
          }
        } catch (refreshErr) {
          if (!isAbortError(refreshErr)) {
            /* list refresh covers divergence */
          }
        } finally {
          if (submitRefreshAbortRef.current === refreshAc) submitRefreshAbortRef.current = null;
        }
      } else {
        await adminApi.createChapter(token, {
          subjectId,
          title: normalizedTitle,
          description,
          orderIndex,
          isActive: Boolean(createFormState.isActive),
        });
        setSuccessMessage('Chapter created successfully.');
      }

      const keepCourseId = selectedCourseId || String(courseId);
      const keepSubjectId = selectedSubjectId || String(subjectId);

      const align = {};
      if (!selectedCourseId && courseId) align.courseId = String(courseId);
      if (!selectedSubjectId && subjectId) align.subjectId = String(subjectId);
      if (Object.keys(align).length) applyHierarchySelection(align);

      if (!isEditing) {
        resetCreateForm(keepCourseId, keepSubjectId);
      }
      bumpChapterList();
    } catch (err) {
      const fallbackSave = isEditing ? 'Chapter update failed.' : 'Unable to save chapter.';
      setErrorState((prev) => ({
        ...prev,
        form: safeChapterMutationError(err, fallbackSave, { context: 'mutate' }),
      }));
      if ((err?.status === 404 || err?.status === 410) && isEditing) {
        cancelEditUi();
        bumpChapterList();
      }
    } finally {
      submitLockRef.current = false;
      if (mountedRef.current) setIsSubmitting(false);
    }
  }

  async function onArchiveChapter(chapter) {
    if (!chapter?.id || isSubmitting || archivingChapterId) return;
    if (!chapter?.isActive) return;
    if (!window.confirm(`Archive chapter "${chapter.title || 'Untitled'}"? This cannot be undone from the UI.`)) return;

    setErrorState((prev) => ({ ...prev, archive: '' }));
    setSuccessMessage('');
    setArchivingChapterId(chapter.id);

    try {
      await adminApi.archiveChapter(token, chapter.id);
      setSuccessMessage('Chapter archived successfully.');
      if (editingChapterId === chapter.id) {
        cancelEditUi();
      }
      bumpChapterList();
    } catch (err) {
      setErrorState((prev) => ({
        ...prev,
        archive: safeChapterMutationError(err, 'Unable to archive chapter.', { context: 'archive' }),
      }));
    } finally {
      if (mountedRef.current) setArchivingChapterId(null);
    }
  }

  function onResetChapterFormFields() {
    resetCreateForm(selectedCourseId, selectedSubjectId);
  }

  const filterHierarchyAlert =
    filterHierarchyErrors.courseLoad || filterHierarchyErrors.subjectLoad || filterHierarchyErrors.chapterLoad;

  const mutationBusy = isSubmitting || Boolean(archivingChapterId) || isFetchingChapterDetail;
  const chapterFormDisabled =
    mutationBusy ||
    Boolean(formMode === 'create' && createFormState.courseId && isLoadingFormSubjects);

  const editSurfaceOpen = formMode === 'edit' && Boolean(editingChapterId);

  return (
    <section className="admin-page">
      <AdminChapterEditDialog
        dialogRef={editDialogRef}
        layoutEnabled={editSurfaceOpen}
        detailLoading={isFetchingChapterDetail}
        formState={editFormState}
        onFormChange={onEditFormChange}
        lockedTitles={lockedEditTitles}
        mutationBusy={mutationBusy}
        chapterFormDisabled={chapterFormDisabled}
        dismissLocked={isSubmitting}
        formError={errorState.form}
        onSubmit={onSubmit}
        onDismiss={cancelEditUi}
        isSubmitting={isSubmitting}
      />

      <section className="admin-card">
        <h2 className="heading-3">Chapters</h2>
        <p className="admin-muted" style={{ marginTop: '0.5rem' }}>
          Manage chapters under Course → Subject. Select a course and subject to view and maintain chapter content.
        </p>
      </section>

      <section className="admin-card" style={{ marginTop: '1rem' }}>
        <h3 className="heading-4">Filter</h3>
        <div className="admin-form-grid" style={{ marginTop: '1rem' }}>
          <div className="admin-field">
            <label htmlFor="filterCourseId">Course</label>
            <select
              id="filterCourseId"
              name="filterCourseId"
              value={selectedCourseId}
              onChange={onFilterCourseChange}
              disabled={isLoadingCourses || mutationBusy}
            >
              <option value="">
                {isLoadingCourses ? 'Loading courses…' : sortedCourses.length ? 'Select a course…' : 'No courses available'}
              </option>
              {sortedCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} · #{course.id}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor="filterSubjectId">Subject</label>
            <select
              id="filterSubjectId"
              name="filterSubjectId"
              value={selectedSubjectId}
              onChange={onFilterSubjectChange}
              disabled={!selectedCourseId || isLoadingSubjects || mutationBusy}
            >
              <option value="">
                {!selectedCourseId
                  ? 'Select a course first'
                  : isLoadingSubjects
                    ? 'Loading subjects…'
                    : sortedSubjects.length
                      ? 'Select a subject…'
                      : 'No subjects under this course'}
              </option>
              {sortedSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title} · #{subject.id}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor="filterSearch">Search</label>
            <input
              id="filterSearch"
              name="filterSearch"
              type="search"
              value={filters.search}
              onChange={onFilterSearchChange}
              placeholder="Search by title or description"
              disabled={!selectedSubjectId || mutationBusy}
              autoComplete="off"
            />
          </div>

          <div className="admin-field">
            <label htmlFor="filterStatus">Status</label>
            <select
              id="filterStatus"
              name="filterStatus"
              value={filters.status}
              onChange={onFilterStatusChange}
              disabled={!selectedSubjectId || mutationBusy}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
      </section>

      {filterHierarchyAlert ? (
        <p className="admin-error" role="alert" style={{ marginTop: '1rem' }}>
          {filterHierarchyAlert}
        </p>
      ) : null}

      {errorState.list ? (
        <div role="alert" style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <p className="admin-error" style={{ margin: 0, flex: '1 1 200px' }}>
            {errorState.list}
          </p>
          {selectedSubjectId ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={retryChapterList}
              disabled={isLoadingChapters || mutationBusy}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {successMessage ? (
        <p className="admin-success" role="status" style={{ marginTop: '1rem' }}>
          {successMessage}
        </p>
      ) : null}
      {errorState.archive ? (
        <p className="admin-error" role="alert" style={{ marginTop: '1rem' }}>
          {errorState.archive}
        </p>
      ) : null}

      <section className="admin-card" style={{ marginTop: '1rem' }}>
        <h3 className="heading-4">Chapter list</h3>

        {!selectedSubjectId ? (
          <p className="admin-muted" style={{ marginTop: '0.75rem' }}>
            Select a course and subject to load chapters.
          </p>
        ) : isLoadingChapters ? (
          <p className="admin-muted" style={{ marginTop: '0.75rem' }} aria-busy="true" role="status">
            Loading chapters…
          </p>
        ) : sortedTableChapters.length === 0 ? (
          <p className="admin-muted" style={{ marginTop: '0.75rem' }}>
            {filters.status === 'archived'
              ? 'No archived chapters to display.'
              : filters.status === 'all'
                ? 'No chapters to display.'
                : debouncedSearch.trim()
                ? 'No chapters match your search.'
                : 'No chapters yet. Create one below.'}
          </p>
        ) : (
          <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Chapter title</th>
                  <th scope="col">Course</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Order</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created at</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTableChapters.map((chapter) => {
                  const rowBusy = mutationBusy || archivingChapterId === chapter.id;

                  function handleRowEdit() {
                    void handleEditChapter(chapter);
                  }

                  function handleRowArchive() {
                    void onArchiveChapter(chapter);
                  }

                  return (
                    <AdminChapterTableRow
                      key={chapter.id}
                      chapter={chapter}
                      rowBusy={rowBusy}
                      archiving={archivingChapterId === chapter.id}
                      onEditChapter={handleRowEdit}
                      onArchiveChapter={handleRowArchive}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formMode === 'create' ? (
        <section className="admin-card" style={{ marginTop: '1rem' }}>
          <h3 className="heading-4">Create chapter</h3>
          <form className="admin-form-grid" style={{ marginTop: '1rem' }} onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
            <AdminChapterFormFields
              variant="create"
              fieldIdPrefix="chapterCreate"
              formState={createFormState}
              onFormChange={onCreateFormChange}
              sortedCourses={sortedCourses}
              sortedFormSubjects={sortedFormSubjects}
              isLoadingCourses={isLoadingCourses}
              isLoadingFormSubjects={isLoadingFormSubjects}
              courseControlDisabled={chapterFormDisabled}
              subjectSelectDisabled={chapterFormDisabled}
              fieldsDisabled={chapterFormDisabled}
            >
              {errorState.form ? (
                <p className="admin-error" role="alert" style={{ gridColumn: '1 / -1' }}>
                  {errorState.form}
                </p>
              ) : null}
              <div className="admin-actions" style={{ gridColumn: '1 / -1' }}>
                <button type="submit" className="btn btn--primary" disabled={chapterFormDisabled}>
                  {isSubmitting ? 'Saving…' : 'Create chapter'}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={onResetChapterFormFields}
                  disabled={chapterFormDisabled}
                >
                  Reset form
                </button>
              </div>
            </AdminChapterFormFields>
          </form>
        </section>
      ) : null}
    </section>
  );
}
