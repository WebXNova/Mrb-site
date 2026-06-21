import { useEffect, useId, useRef, useState } from 'react';
import AddPhotoIcon from './AddPhotoIcon.jsx';
import { uploadImage } from '../utils/image/uploadImage.js';
import { uploadOptionImage } from '../utils/image/uploadOptionImage.js';
import { validateImageUrl } from '../utils/image/validateImageUrl.js';
import { validateOptionImageUrl } from '../utils/image/validateOptionImageUrl.js';

/**
 * Testmoz-style image insert — upload file or paste URL (ribbon only).
 */
export default function ImageInsertPopover({
  open,
  targetLabel = 'question',
  isOptionTarget = false,
  onClose,
  onCommit,
}) {
  const titleId = useId();
  const fileRef = useRef(null);
  const urlRef = useRef(null);
  const [tab, setTab] = useState('url');
  const [urlDraft, setUrlDraft] = useState('https://');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('url');
    setUrlDraft('https://');
    setError('');
    setUploading(false);
    const timer = window.setTimeout(() => urlRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const secureUrl = isOptionTarget ? await uploadOptionImage(file) : await uploadImage(file);
      onCommit(secureUrl);
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleInsertUrl(event) {
    event.preventDefault();
    const check = isOptionTarget
      ? validateOptionImageUrl(urlDraft)
      : validateImageUrl(urlDraft);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    onCommit(check.url);
  }

  return (
    <div className="qaw-img-popover-backdrop" role="presentation" onClick={onClose}>
      <div
        className="qaw-img-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="qaw-img-popover__title">
          <AddPhotoIcon className="qaw-img-popover__title-icon" titleAccess="Insert image" />
          Insert image
        </h2>
        <p className="qaw-img-popover__hint">
          Adding to: <strong>{targetLabel}</strong>
        </p>

        <div className="qaw-img-popover__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'url'}
            className={`qaw-img-popover__tab${tab === 'url' ? ' qaw-img-popover__tab--active' : ''}`}
            onClick={() => setTab('url')}
          >
            Paste URL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            className={`qaw-img-popover__tab${tab === 'upload' ? ' qaw-img-popover__tab--active' : ''}`}
            onClick={() => setTab('upload')}
          >
            <AddPhotoIcon className="qaw-img-popover__tab-icon" />
            Upload file
          </button>
        </div>

        {tab === 'url' ? (
          <form onSubmit={handleInsertUrl}>
            <div className="admin-field">
              <label htmlFor="qaw-img-url">Image URL</label>
              <input
                ref={urlRef}
                id="qaw-img-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                value={urlDraft}
                onChange={(e) => {
                  setUrlDraft(e.target.value);
                  if (error) setError('');
                }}
                placeholder="https://example.com/image.png"
                aria-invalid={Boolean(error)}
              />
            </div>
            <div className="qaw-img-popover__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary btn--sm" disabled={uploading}>
                Insert
              </button>
            </div>
          </form>
        ) : (
          <div className="qaw-img-popover__upload">
            <label htmlFor="qaw-img-file" className="qaw-img-popover__upload-label">
              <AddPhotoIcon className="qaw-img-popover__upload-icon" />
              <span>{uploading ? 'Uploading…' : 'Choose photo'}</span>
            </label>
            <input
              ref={fileRef}
              id="qaw-img-file"
              className="qaw-img-popover__file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleUpload}
              disabled={uploading}
            />
            <p className="admin-field__hint">
              JPEG, PNG, or WebP · max 5 MB
            </p>
            <div className="qaw-img-popover__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {error ? (
          <div className="admin-field__error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
