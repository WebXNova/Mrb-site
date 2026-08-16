/**
 * Course notes tab — upload form, scoped list, edit/deactivate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import ChevronRightOutlinedIcon from '@mui/icons-material/ChevronRightOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import NoteFileTypeIcon from '../../../components/notes/NoteFileTypeIcon';
import { formatFileSize } from '../../../utils/formatFileSize';
import { adminApi } from '../../../api/adminApi';
import { useAdminToast } from '../../context/AdminToastContext';
import AdminConfirmDialog from '../AdminConfirmDialog';
import AdminLoadingButton from '../AdminLoadingButton';
import CourseStatusBadge from './CourseStatusBadge';
import PremiumFormField from './PremiumFormField';
import '../../styles/admin-course-notes.css';

const ACCEPT =
  'application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.jpg,.jpeg,.png,.docx';
const MAX_BYTES = 100 * 1024 * 1024;

const EMPTY_FORM = {
  title: '',
  description: '',
  subjectId: '',
  chapterId: '',
  lectureId: '',
};

function isImageFile(file) {
  if (!file) return false;
  if (String(file.type || '').startsWith('image/')) return true;
  return /\.(jpg|jpeg|png)$/i.test(String(file.name || ''));
}

function validateClientFile(file) {
  if (!file) return 'Choose a file to upload.';
  if (file.size > MAX_BYTES) return 'File must be 100 MB or smaller.';
  const name = String(file.name || '').toLowerCase();
  const okExt = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'].some((ext) => name.endsWith(ext));
  if (!okExt) return 'Allowed types: PDF, JPG, PNG, DOCX.';
  return '';
}

function validateNoteForm(form, file) {
  const title = String(form.title || '').trim();
  if (title.length < 1) return 'Title is required.';
  if (title.length > 255) return 'Title must be at most 255 characters.';
  return validateClientFile(file);
}

function noteScopeBreadcrumb(note) {
  if (!note.subjectId) return null;
  const parts = [];
  if (note.chapterTitle) parts.push(note.chapterTitle);
  if (note.lectureTitle) parts.push(note.lectureTitle);
  return parts.length ? parts.join(' → ') : null;
}

function NoteRow({ note, busyId, onOpenFile, onEdit, onToggleRequest }) {
  const breadcrumb = noteScopeBreadcrumb(note);

  return (
    <li className={`course-notes-item${note.isActive ? '' : ' course-notes-item--inactive'}`}>
      <NoteFileTypeIcon fileType={note.fileType} size="md" className="course-notes-item__type-icon" />
      <div className="course-notes-item__body">
        <div className="course-notes-item__title-row">
          <span className="course-notes-item__title">{note.title}</span>
          <CourseStatusBadge active={note.isActive} />
        </div>
        {breadcrumb ? (
          <p className="course-notes-item__scope-tag" title={note.scopeLabel}>
            {breadcrumb}
          </p>
        ) : note.scopeLabel && note.scopeLabel !== 'Course-wide' ? (
          <p className="course-notes-item__scope-tag">{note.scopeLabel}</p>
        ) : null}
        {note.description ? <p className="course-notes-item__desc">{note.description}</p> : null}
        <p className="course-notes-item__meta">
          <span className="course-notes-item__file-size">{formatFileSize(note.fileSize)}</span>
          {note.uploadedByName ? (
            <>
              <span className="course-notes-item__meta-sep" aria-hidden>
                ·
              </span>
              <span>{note.uploadedByName}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="course-notes-item__actions">
        <button
          type="button"
          className="btn--course-ghost btn--course-ghost-sm"
          onClick={() => onOpenFile(note)}
          title="Open file"
        >
          <OpenInNewOutlinedIcon fontSize="small" />
        </button>
        <button
          type="button"
          className="btn--course-ghost btn--course-ghost-sm"
          onClick={() => onEdit(note)}
          title="Edit title & description"
        >
          <EditOutlinedIcon fontSize="small" />
        </button>
        <button
          type="button"
          className="btn--course-ghost btn--course-ghost-sm"
          disabled={busyId === note.id}
          onClick={() => onToggleRequest(note)}
          title={note.isActive ? 'Deactivate' : 'Activate'}
        >
          <PowerSettingsNewOutlinedIcon fontSize="small" />
        </button>
      </div>
    </li>
  );
}

export default function AdminCourseNotesPanel({ token, courseId, variant = 'embedded' }) {
  const toast = useAdminToast();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [scopeLoading, setScopeLoading] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [filterSubjectId, setFilterSubjectId] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [editNote, setEditNote] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', description: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const loadNotes = useCallback(async () => {
    if (!token || !courseId) return;
    setLoading(true);
    try {
      const filters = {};
      if (filterSubjectId) filters.subject_id = filterSubjectId;
      const res = await adminApi.courseNotes(token, courseId, filters);
      setNotes(res?.data?.notes ?? []);
    } catch (err) {
      toast.error(err.message || 'Failed to load notes.');
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [token, courseId, filterSubjectId, toast]);

  const loadSubjects = useCallback(async () => {
    if (!token || !courseId) return;
    try {
      const res = await adminApi.subjects(token, courseId, { includeInactive: true });
      setSubjects(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setSubjects([]);
    }
  }, [token, courseId]);

  useEffect(() => {
    loadNotes();
    loadSubjects();
  }, [loadNotes, loadSubjects]);

  useEffect(() => {
    if (!token || !form.subjectId) {
      setChapters([]);
      return undefined;
    }
    let cancelled = false;
    setScopeLoading(true);
    adminApi
      .chapters(token, form.subjectId)
      .then((res) => {
        if (!cancelled) setChapters(Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setChapters([]);
      })
      .finally(() => {
        if (!cancelled) setScopeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, form.subjectId]);

  useEffect(() => {
    if (!token || !form.chapterId || !courseId) {
      setLectures([]);
      return undefined;
    }
    let cancelled = false;
    setScopeLoading(true);
    adminApi
      .listLectures(token, { chapter_id: form.chapterId, course_id: courseId, limit: 500 })
      .then((res) => {
        const payload = res?.data;
        const rows = Array.isArray(payload) ? payload : payload?.items ?? [];
        if (!cancelled) setLectures(rows);
      })
      .catch(() => {
        if (!cancelled) setLectures([]);
      })
      .finally(() => {
        if (!cancelled) setScopeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, form.chapterId, courseId]);

  useEffect(() => {
    if (!file || !isImageFile(file)) {
      setFilePreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const listSections = useMemo(() => {
    const courseWide = [];
    const bySubject = new Map();

    for (const note of notes) {
      if (!note.subjectId) {
        courseWide.push(note);
        continue;
      }
      const key = String(note.subjectId);
      if (!bySubject.has(key)) {
        bySubject.set(key, {
          subjectId: note.subjectId,
          subjectTitle: note.subjectTitle || `Subject ${note.subjectId}`,
          notes: [],
        });
      }
      bySubject.get(key).notes.push(note);
    }

    return {
      courseWide,
      subjects: Array.from(bySubject.values()).sort((a, b) =>
        String(a.subjectTitle).localeCompare(String(b.subjectTitle))
      ),
    };
  }, [notes]);

  function onFormChange(event) {
    const { name, value } = event.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'subjectId') {
        next.chapterId = '';
        next.lectureId = '';
      }
      if (name === 'chapterId') {
        next.lectureId = '';
      }
      return next;
    });
    if (formError) setFormError('');
  }

  function assignFile(nextFile) {
    const err = validateClientFile(nextFile);
    if (err) {
      setFormError(err);
      setFile(null);
      return;
    }
    setFile(nextFile);
    setFormError('');
  }

  function clearSelectedFile(event) {
    event?.stopPropagation?.();
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFormError('');
  }

  function onFileInputChange(event) {
    assignFile(event.target.files?.[0] ?? null);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragOver(false);
    assignFile(event.dataTransfer?.files?.[0] ?? null);
  }

  async function onUploadSubmit(event) {
    event.preventDefault();
    const err = validateNoteForm(form, file);
    if (err) {
      setFormError(err);
      return;
    }

    const formData = new FormData();
    formData.append('title', form.title.trim());
    if (form.description.trim()) formData.append('description', form.description.trim());
    if (form.subjectId) formData.append('subject_id', String(form.subjectId));
    if (form.chapterId) formData.append('chapter_id', String(form.chapterId));
    if (form.lectureId) formData.append('lecture_id', String(form.lectureId));
    formData.append('file', file);

    setUploading(true);
    setUploadProgress(0);
    try {
      await adminApi.uploadCourseNote(token, courseId, formData, {
        onProgress: setUploadProgress,
      });
      toast.success('Note uploaded.');
      setForm(EMPTY_FORM);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadNotes();
    } catch (uploadErr) {
      toast.error(uploadErr.message || 'Upload failed.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function openEdit(note) {
    setEditNote(note);
    setEditForm({
      title: note.title || '',
      description: note.description || '',
    });
  }

  async function saveEdit() {
    if (!editNote) return;
    const title = editForm.title.trim();
    if (!title) {
      toast.error('Title is required.');
      return;
    }
    setEditSaving(true);
    try {
      await adminApi.updateCourseNote(token, editNote.id, {
        title,
        description: editForm.description.trim() || null,
      });
      toast.success('Note updated.');
      setEditNote(null);
      await loadNotes();
    } catch (err) {
      toast.error(err.message || 'Update failed.');
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(note) {
    setBusyId(note.id);
    try {
      if (note.isActive) {
        await adminApi.deactivateCourseNote(token, note.id);
        toast.success('Note deactivated.');
      } else {
        await adminApi.activateCourseNote(token, note.id);
        toast.success('Note activated.');
      }
      await loadNotes();
    } catch (err) {
      toast.error(err.message || 'Status update failed.');
    } finally {
      setBusyId(null);
      setConfirmDialog(null);
    }
  }

  function openNoteFile(note) {
    const url = adminApi.courseNoteFileUrl(note.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function resolvePreviewFileType(selectedFile) {
    const name = String(selectedFile?.name || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.docx')) return 'docx';
    return 'image';
  }

  const isStandalone = variant === 'standalone';
  const showLibraryFirst = isStandalone && !loading && notes.length > 0;
  const uploadStep = showLibraryFirst ? 3 : isStandalone ? 2 : null;
  const libraryStep = showLibraryFirst ? 2 : isStandalone ? 3 : null;

  const scopeTrail = [
    form.subjectId
      ? subjects.find((s) => String(s.id) === String(form.subjectId))?.title || 'Subject'
      : 'Whole course',
    form.subjectId && form.chapterId
      ? chapters.find((ch) => String(ch.id) === String(form.chapterId))?.title || 'Chapter'
      : form.subjectId
        ? 'All chapters'
        : null,
    form.chapterId && form.lectureId
      ? lectures.find((lec) => String(lec.id) === String(form.lectureId))?.title || 'Lecture'
      : form.chapterId
        ? 'All lectures'
        : null,
  ].filter(Boolean);

  const uploadForm = (
    <form className="course-notes-upload course-edit-section" onSubmit={onUploadSubmit}>
      {isStandalone ? (
        <div className="course-notes-section-head">
          {uploadStep ? (
            <span className="course-notes-section-head__step" aria-hidden>
              {uploadStep}
            </span>
          ) : null}
          <div>
            <h3 className="course-notes-upload__title">Upload a note</h3>
            <p className="course-notes-upload__lead">
              Add PDF, image, or Word study material for students in this course.
            </p>
          </div>
        </div>
      ) : (
        <div className="course-notes-upload__intro">
          <h3 className="course-notes-upload__title">Upload a note</h3>
          <p className="course-notes-upload__lead">Add study material for students enrolled in this course.</p>
        </div>
      )}

      <div className="course-notes-upload__body">
        <div className="course-notes-upload__block">
          <p className="course-notes-upload__block-label">Details</p>
          <div className="course-notes-upload__grid">
            <PremiumFormField id="note_title" label="Title" required>
              <input
                id="note_title"
                name="title"
                className="course-edit-input"
                value={form.title}
                onChange={onFormChange}
                disabled={uploading}
                maxLength={255}
                required
              />
            </PremiumFormField>

            <PremiumFormField id="note_description" label="Description">
              <textarea
                id="note_description"
                name="description"
                className="course-edit-textarea"
                rows={3}
                value={form.description}
                onChange={onFormChange}
                disabled={uploading}
              />
            </PremiumFormField>
          </div>
        </div>

        <div className="course-notes-upload__block">
          <div className="course-notes-scope">
            <div className="course-notes-scope__head">
              <p className="course-notes-scope__label">Audience (optional)</p>
              <p className="course-notes-scope__hint">
                Start broad and narrow only if needed. Leaving a step blank keeps the note visible
                to everyone at that level.
              </p>
            </div>

            {scopeTrail.length ? (
              <div className="course-notes-scope__trail" aria-live="polite">
                {scopeTrail.map((segment, index) => (
                  <span key={`${segment}-${index}`} className="course-notes-scope__trail-segment">
                    {index > 0 ? (
                      <ChevronRightOutlinedIcon className="course-notes-scope__trail-chevron" aria-hidden />
                    ) : null}
                    <span>{segment}</span>
                  </span>
                ))}
              </div>
            ) : null}

            <ol className="course-notes-scope__steps" aria-label="Narrow note visibility">
              <li className="course-notes-scope__step">
                <span className="course-notes-scope__step-marker">1</span>
                <div className="course-notes-scope__step-body">
                  <div className="course-notes-scope__step-copy">
                    <span className="course-notes-scope__step-name">Subject</span>
                    <span className="course-notes-scope__step-default">Blank = whole course</span>
                  </div>
                  <select
                    id="note_subject"
                    name="subjectId"
                    className="course-edit-select"
                    value={form.subjectId}
                    onChange={onFormChange}
                    disabled={uploading}
                  >
                    <option value="">Whole course</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              </li>

              <li
                className={`course-notes-scope__step${
                  !form.subjectId ? ' course-notes-scope__step--disabled' : ''
                }`}
              >
                <span className="course-notes-scope__step-marker">2</span>
                <div className="course-notes-scope__step-body">
                  <div className="course-notes-scope__step-copy">
                    <span className="course-notes-scope__step-name">Chapter</span>
                    <span className="course-notes-scope__step-default">Blank = all chapters in subject</span>
                  </div>
                  <select
                    id="note_chapter"
                    name="chapterId"
                    className="course-edit-select"
                    value={form.chapterId}
                    onChange={onFormChange}
                    disabled={uploading || !form.subjectId || scopeLoading}
                  >
                    <option value="">All chapters in subject</option>
                    {chapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.title}
                      </option>
                    ))}
                  </select>
                </div>
              </li>

              <li
                className={`course-notes-scope__step${
                  !form.chapterId ? ' course-notes-scope__step--disabled' : ''
                }`}
              >
                <span className="course-notes-scope__step-marker">3</span>
                <div className="course-notes-scope__step-body">
                  <div className="course-notes-scope__step-copy">
                    <span className="course-notes-scope__step-name">Lecture</span>
                    <span className="course-notes-scope__step-default">Blank = all lectures in chapter</span>
                  </div>
                  <select
                    id="note_lecture"
                    name="lectureId"
                    className="course-edit-select"
                    value={form.lectureId}
                    onChange={onFormChange}
                    disabled={uploading || !form.chapterId || scopeLoading}
                  >
                    <option value="">All lectures in chapter</option>
                    {lectures.map((lec) => (
                      <option key={lec.id} value={lec.id}>
                        {lec.title}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            </ol>
          </div>
        </div>

        <div className="course-notes-upload__block">
          <p className="course-notes-upload__block-label">File</p>
          <div
            className={`course-notes-dropzone${dragOver ? ' course-notes-dropzone--dragover' : ''}${
              file ? ' course-notes-dropzone--has-file' : ''
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !uploading && !file && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (file) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!uploading) fileInputRef.current?.click();
              }
            }}
            role={file ? undefined : 'button'}
            tabIndex={file ? -1 : 0}
            aria-label="Upload note file"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={onFileInputChange}
              hidden
              disabled={uploading}
            />

            {file ? (
              <div className="course-notes-dropzone__preview">
                <div className="course-notes-dropzone__preview-card">
                  {filePreviewUrl ? (
                    <img
                      src={filePreviewUrl}
                      alt=""
                      className="course-notes-dropzone__thumb"
                    />
                  ) : (
                    <NoteFileTypeIcon fileType={resolvePreviewFileType(file)} size="lg" />
                  )}
                  <div className="course-notes-dropzone__preview-copy">
                    <p className="course-notes-dropzone__filename">{file.name}</p>
                    <p className="course-notes-dropzone__filesize">{formatFileSize(file.size)}</p>
                    <p className="course-notes-dropzone__ready">Ready to upload</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="course-notes-dropzone__remove btn--course-ghost btn--course-ghost-sm"
                  onClick={clearSelectedFile}
                  disabled={uploading}
                  aria-label="Remove selected file"
                >
                  <CloseOutlinedIcon fontSize="small" />
                  Remove file
                </button>
              </div>
            ) : (
              <>
                <CloudUploadOutlinedIcon className="course-notes-dropzone__icon" aria-hidden />
                <p className="course-notes-dropzone__hint">
                  <strong>Drag & drop or click to upload</strong>
                </p>
                <p className="course-notes-dropzone__types">PDF, JPG, PNG, DOCX · max 100 MB</p>
              </>
            )}
          </div>
        </div>
      </div>

      {uploading ? (
        <div className="course-notes-progress" aria-live="polite">
          <div className="course-notes-progress__track">
            <div
              className="course-notes-progress__bar"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="course-notes-progress__label">Uploading… {uploadProgress}%</span>
        </div>
      ) : null}

      {formError ? (
        <p className="admin-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="course-notes-upload__actions">
        <AdminLoadingButton
          type="submit"
          className="btn--course-primary"
          loading={uploading}
          disabled={uploading || !file}
        >
          Upload note
        </AdminLoadingButton>
      </div>
    </form>
  );

  const librarySection = (
    <section className="course-notes-library course-edit-section">
      {isStandalone ? (
        <div className="course-notes-section-head">
          {libraryStep ? (
            <span className="course-notes-section-head__step" aria-hidden>
              {libraryStep}
            </span>
          ) : null}
          <div>
            <h3 className="course-notes-library__title">Uploaded notes</h3>
            <p className="course-notes-library__subtitle">
              {loading
                ? 'Loading library…'
                : notes.length === 1
                  ? '1 note in this course'
                  : `${notes.length} notes in this course`}
            </p>
          </div>
        </div>
      ) : (
        <div className="course-notes-list__toolbar">
          <div>
            <h3 className="course-notes-library__title">Uploaded notes</h3>
            <p className="course-notes-library__subtitle">
              {notes.length === 1 ? '1 note' : `${notes.length} notes`} in this course
            </p>
          </div>
        </div>
      )}

      <div className="course-notes-list__toolbar course-notes-list__toolbar--filter">
        <div className="course-notes-filter-wrap">
          <label className="course-notes-filter" htmlFor="notes-filter-subject">
            Filter by subject
          </label>
          <select
            id="notes-filter-subject"
            className="course-edit-select course-notes-filter__select"
            value={filterSubjectId}
            onChange={(e) => setFilterSubjectId(e.target.value)}
          >
            <option value="">All notes</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="course-edit-section__loading">Loading notes…</p>
      ) : notes.length === 0 ? (
        <div className="admin-empty-state admin-empty-state--compact course-notes-list__empty">
          <DescriptionOutlinedIcon className="course-notes-list__empty-icon" aria-hidden />
          <p className="admin-empty-state__title">No notes uploaded yet</p>
          <p className="admin-empty-state__text">
            {showLibraryFirst
              ? 'Use the upload form below to add the first file for this course.'
              : 'Upload PDFs, images, or Word documents using the form above.'}
          </p>
        </div>
      ) : (
        <div className="course-notes-list">
          {listSections.courseWide.length > 0 ? (
            <section className="course-notes-group course-notes-group--flat">
              <h4 className="course-notes-group__heading">Course-wide</h4>
              <ul className="course-notes-group__items">
                {listSections.courseWide.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    busyId={busyId}
                    onOpenFile={openNoteFile}
                    onEdit={openEdit}
                    onToggleRequest={(row) =>
                      setConfirmDialog({
                        note: row,
                        mode: row.isActive ? 'deactivate' : 'activate',
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {listSections.subjects.map((section) => (
            <details
              key={section.subjectId}
              className="course-notes-group course-notes-group--collapsible"
              open={section.notes.length <= 4}
            >
              <summary className="course-notes-group__summary">
                <ExpandMoreOutlinedIcon className="course-notes-group__chevron" aria-hidden />
                <span className="course-notes-group__heading">{section.subjectTitle}</span>
                <span className="course-notes-group__count">
                  {section.notes.length} note{section.notes.length === 1 ? '' : 's'}
                </span>
              </summary>
              <ul className="course-notes-group__items">
                {section.notes.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    busyId={busyId}
                    onOpenFile={openNoteFile}
                    onEdit={openEdit}
                    onToggleRequest={(row) =>
                      setConfirmDialog({
                        note: row,
                        mode: row.isActive ? 'deactivate' : 'activate',
                      })
                    }
                  />
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className={`course-notes-panel course-notes-panel--${variant}`}>
      {!isStandalone ? (
        <header className="course-notes-panel__header course-edit-section__header">
          <div>
            <h2 className="course-edit-section__title">Notes</h2>
            <p className="course-edit-section__subtitle course-notes-panel__subtitle">
              Upload PDF, image, or Word documents scoped to this course — optionally narrowed to a
              subject, chapter, or lecture.
            </p>
          </div>
        </header>
      ) : null}

      <div className="course-notes-panel__sections">
        {showLibraryFirst ? (
          <>
            {librarySection}
            {uploadForm}
          </>
        ) : (
          <>
            {uploadForm}
            {librarySection}
          </>
        )}
      </div>

      <AdminConfirmDialog
        open={Boolean(editNote)}
        title="Edit note"
        confirmLabel={editSaving ? 'Saving…' : 'Save'}
        busy={editSaving}
        onCancel={() => !editSaving && setEditNote(null)}
        onConfirm={saveEdit}
        message={
          <div className="course-notes-edit-form">
            <PremiumFormField id="edit_note_title" label="Title" required>
              <input
                id="edit_note_title"
                className="course-edit-input"
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                disabled={editSaving}
                maxLength={255}
              />
            </PremiumFormField>
            <PremiumFormField id="edit_note_description" label="Description">
              <textarea
                id="edit_note_description"
                className="course-edit-textarea"
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                disabled={editSaving}
              />
            </PremiumFormField>
          </div>
        }
      />

      <AdminConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.mode === 'deactivate' ? 'Deactivate note?' : 'Activate note?'}
        message={
          confirmDialog?.mode === 'deactivate'
            ? 'Students will no longer see this note while it is inactive. The file remains stored for audit.'
            : 'This note will become visible again when student access is enabled for notes.'
        }
        confirmLabel={confirmDialog?.mode === 'deactivate' ? 'Deactivate' : 'Activate'}
        danger={confirmDialog?.mode === 'deactivate'}
        busy={busyId != null}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => confirmDialog && toggleActive(confirmDialog.note)}
      />
    </div>
  );
}
