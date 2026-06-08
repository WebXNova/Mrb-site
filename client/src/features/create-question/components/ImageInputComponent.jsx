import { useRef, useState } from 'react';
import { uploadImage } from '../utils/image/uploadImage.js';
import { validateImageUrl } from '../utils/image/validateImageUrl.js';
import { resolveImagePreviewSrc } from '../utils/image/imagePreviewUrl.js';

const ACCEPTED_UPLOAD_TYPES = 'image/jpeg,image/png,image/webp';

/**
 * Secure question image input — upload or URL.
 *
 * Data flow:
 *   File → validateImageFile → uploadImage → validateImageUrl → onImageCommitted(url, source)
 *   URL draft → validateImageUrl → onImageCommitted(url, 'url')
 *
 * Files are never stored directly in state.
 * Only validated URLs are allowed into application state.
 * Backend re-validation is mandatory.
 */
export default function ImageInputComponent({
  imageUrl = '',
  imageSource = 'none',
  error = '',
  onImageCommitted,
  onImageRemoved,
  onClearError,
  disabled = false,
}) {
  const fileInputRef = useRef(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlDraftError, setUrlDraftError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const previewSrc = resolveImagePreviewSrc(imageUrl);
  const hasImage = Boolean(previewSrc);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    setUploadError('');
    onClearError?.();
    if (!file) return;

    setUploading(true);
    try {
      const secureUrl = await uploadImage(file);
      onImageCommitted(secureUrl, 'upload');
      setUrlDraft('');
      setUrlDraftError('');
    } catch (err) {
      setUploadError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleApplyUrl() {
    const check = validateImageUrl(urlDraft);
    if (!check.ok) {
      setUrlDraftError(check.message);
      return;
    }
    onImageCommitted(check.url, 'url');
    setUrlDraft('');
    setUrlDraftError('');
    setUploadError('');
    onClearError?.();
  }

  function handleRemove() {
    onImageRemoved();
    setUrlDraft('');
    setUrlDraftError('');
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleReplace() {
    handleRemove();
  }

  return (
    <section className="admin-card cq-section" aria-labelledby="cq-image-heading">
      <h2 id="cq-image-heading" className="heading-4">
        Question image
      </h2>
      <p className="admin-field__hint cq-section__hint">
        Optional · JPEG, PNG, or WebP · max 5 MB · http(s) or uploaded path only.
      </p>

      {hasImage ? (
        <div className="admin-question-image-preview">
          <img
            src={previewSrc}
            alt="Question image preview"
            className="admin-question-image-preview__img"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <p className="admin-field__hint">
            Source: {imageSource === 'upload' ? 'Upload' : 'URL'}
          </p>
          <div className="admin-question-image-preview__actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleReplace}
              disabled={disabled || uploading}
            >
              Replace image
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleRemove}
              disabled={disabled || uploading}
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-question-image-inputs">
          <div className="admin-question-image-upload">
            <label htmlFor="cq-question-image-file" className="admin-stat-card__label">
              Upload image
            </label>
            <input
              id="cq-question-image-file"
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_UPLOAD_TYPES}
              onChange={handleFileChange}
              disabled={disabled || uploading}
            />
            <small className="admin-field__hint">
              {uploading ? 'Uploading…' : 'Select JPEG, PNG, or WebP'}
            </small>
            {uploadError ? (
              <div className="admin-field__error" role="alert">
                {uploadError}
              </div>
            ) : null}
          </div>

          <div className="admin-question-image-url">
            <label htmlFor="cq-question-image-url" className="admin-stat-card__label">
              Image URL
            </label>
            <div className="admin-question-image-url__row">
              <input
                id="cq-question-image-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://example.com/image.png"
                value={urlDraft}
                onChange={(e) => {
                  setUrlDraft(e.target.value);
                  if (urlDraftError) setUrlDraftError('');
                }}
                disabled={disabled || uploading}
                aria-invalid={Boolean(urlDraftError)}
              />
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={handleApplyUrl}
                disabled={disabled || uploading || !urlDraft.trim()}
              >
                Apply URL
              </button>
            </div>
            {urlDraftError ? (
              <div className="admin-field__error" role="alert">
                {urlDraftError}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {error ? (
        <div className="admin-field__error" role="alert" style={{ marginTop: '0.5rem' }}>
          {error}
        </div>
      ) : null}
    </section>
  );
}
