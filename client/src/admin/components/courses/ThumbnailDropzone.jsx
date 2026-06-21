import { useRef, useState } from 'react';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { resolveCourseThumbnailUrl } from '../../../utils/mediaUrl';
const ACCEPT = 'image/jpeg,image/png,image/webp';

export default function ThumbnailDropzone({
  inputRef,
  imageUrl,
  uploading = false,
  disabled = false,
  onFileChange,
  onClear,
  id = 'course-thumbnail',
}) {
  const localRef = useRef(null);
  const ref = inputRef || localRef;
  const [dragOver, setDragOver] = useState(false);

  function pickFile() {
    if (!disabled && !uploading) ref.current?.click();
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const synthetic = { target: { files: [file] } };
    onFileChange(synthetic);
  }

  const previewUrl = resolveCourseThumbnailUrl(imageUrl);

  return (    <div>
      <input
        id={id}
        ref={ref}
        type="file"
        accept={ACCEPT}
        onChange={onFileChange}
        disabled={disabled || uploading}
        hidden
      />
      <div
        className={`thumbnail-dropzone${dragOver ? ' thumbnail-dropzone--dragover' : ''}${
          previewUrl ? ' thumbnail-dropzone--has-image' : ''
        }`}
        role="button"
        tabIndex={0}
        onClick={pickFile}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pickFile();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        aria-label="Upload course thumbnail"
      >
        {previewUrl ? (
          <>
            <img className="thumbnail-dropzone__preview" src={previewUrl} alt="Course thumbnail preview" />
            <div className="thumbnail-dropzone__actions">
              <button
                type="button"
                className="btn--course-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  pickFile();
                }}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : 'Replace'}
              </button>
              <button
                type="button"
                className="btn--course-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                disabled={uploading}
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="thumbnail-dropzone__icon" aria-hidden>
              <CloudUploadOutlinedIcon />
            </div>
            <p className="thumbnail-dropzone__title">
              {uploading ? 'Uploading image…' : 'Drag & drop or click to upload'}
            </p>
            <p className="thumbnail-dropzone__hint">JPEG, PNG, or WebP · Max 2 MB</p>
          </>
        )}
      </div>
    </div>
  );
}
