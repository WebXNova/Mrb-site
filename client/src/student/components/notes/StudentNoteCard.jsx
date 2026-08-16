import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import NoteFileTypeIcon from '../../../components/notes/NoteFileTypeIcon';
import { formatFileSize } from '../../../utils/formatFileSize';

function fileTypeLabel(fileType) {
  if (fileType === 'pdf') return 'PDF';
  if (fileType === 'docx') return 'Word document';
  if (fileType === 'image') return 'Image';
  return 'File';
}

export default function StudentNoteCard({ note, busy, onDownload }) {
  return (
    <article className="student-notes-card">
      <NoteFileTypeIcon fileType={note.fileType} size="md" className="student-notes-card__icon" />
      <div className="student-notes-card__body">
        <h4 className="student-notes-card__title">{note.title}</h4>
        {note.description ? (
          <p className="student-notes-card__desc">{note.description}</p>
        ) : null}
        <p className="student-notes-card__meta">
          <span className="student-notes-card__type">{fileTypeLabel(note.fileType)}</span>
          <span className="student-notes-card__sep" aria-hidden>
            ·
          </span>
          <span className="student-notes-card__size">{formatFileSize(note.fileSize)}</span>
        </p>
      </div>
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
    </article>
  );
}
