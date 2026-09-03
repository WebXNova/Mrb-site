import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import NoteFileTypeIcon from '../../../components/notes/NoteFileTypeIcon';
import { formatFileSize } from '../../../utils/formatFileSize';

function fileTypeLabel(fileType) {
  if (fileType === 'pdf') return 'PDF';
  if (fileType === 'docx') return 'Word document';
  if (fileType === 'image') return 'Image';
  return 'File';
}

function publicFileHref(note) {
  const raw = String(note?.fileUrl || note?.file_url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export default function StudentNoteCard({ note, busy, onDownload }) {
  const publicHref = publicFileHref(note);

  return (
    <article className="student-notes-card">
      <NoteFileTypeIcon fileType={note.fileType || note.file_type} size="md" className="student-notes-card__icon" />
      <div className="student-notes-card__body">
        <h4 className="student-notes-card__title">{note.title}</h4>
        {note.description ? (
          <p className="student-notes-card__desc">{note.description}</p>
        ) : null}
        <p className="student-notes-card__meta">
          <span className="student-notes-card__type">{fileTypeLabel(note.fileType || note.file_type)}</span>
          <span className="student-notes-card__sep" aria-hidden>
            ·
          </span>
          <span className="student-notes-card__size">{formatFileSize(note.fileSize ?? note.file_size)}</span>
        </p>
      </div>
      {publicHref ? (
        <a
          className="btn btn--primary btn--sm student-notes-card__download"
          href={publicHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          <OpenInNewOutlinedIcon fontSize="inherit" aria-hidden />
          View
        </a>
      ) : (
        <button
          type="button"
          className={`btn btn--primary btn--sm student-notes-card__download${busy ? ' btn--loading' : ''}`}
          onClick={() => onDownload(note)}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? (
            <>
              <span className="student-notes__spinner" aria-hidden />
              Downloading…
            </>
          ) : (
            <>
              <DownloadOutlinedIcon fontSize="inherit" aria-hidden />
              Download
            </>
          )}
        </button>
      )}
    </article>
  );
}
