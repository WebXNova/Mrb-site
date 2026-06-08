import { useRef, useState } from 'react';
import { uploadOptionImage } from '../utils/image/uploadOptionImage.js';
import { validateOptionImageUrl } from '../utils/image/validateOptionImageUrl.js';
import { resolveOptionImagePreviewSrc } from '../utils/image/imagePreviewUrl.js';

const ACCEPTED_UPLOAD_TYPES = 'image/jpeg,image/png,image/webp';

/**
 * Secure per-option image input — upload or URL.
 *
 * Data flow:
 *   File → validateImageFile → uploadOptionImage → validateOptionImageUrl → onImageCommitted(url)
 *   URL draft → validateOptionImageUrl → onImageCommitted(url)
 *
 * Only validated URLs enter option state. Files are never stored in reducer state.
 */
export default function OptionImageInputComponent({
  optionKey,
  imageUrl = '',
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

  const previewSrc = resolveOptionImagePreviewSrc(imageUrl);
  const hasImage = Boolean(previewSrc);
  const fieldId = `cq-option-${optionKey}-image`;

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    setUploadError('');
    onClearError?.();
    if (!file) return;

    setUploading(true);
    try {
      const secureUrl = await uploadOptionImage(file);
      onImageCommitted(secureUrl);
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
    const check = validateOptionImageUrl(urlDraft);
    if (!check.ok) {
      setUrlDraftError(check.message);
      return;
    }
    onImageCommitted(check.url);
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

  return (
    <div className="cq-option-image">
      <span className="cq-option-image__label" id={`${fieldId}-label`}>
        Option image (optional)
      </span>
      <p className="admin-field__hint cq-option-image__hint">
        JPEG, PNG, or WebP · max 5 MB · http(s) or uploaded path only.
      </p>

      {hasImage ? (
        <div className="cq-option-image__preview">
          <img
            src={previewSrc}
            alt={`Option ${optionKey} image preview`}
            className="cq-option-image__img"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <div className="cq-option-image__actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleRemove}
              disabled={disabled || uploading}
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <div className="cq-option-image__inputs" aria-labelledby={`${fieldId}-label`}>
          <div className="cq-option-image__upload">
            <label htmlFor={`${fieldId}-file`} className="admin-stat-card__label">
              Upload
            </label>
            <input
              id={`${fieldId}-file`}
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

          <div className="cq-option-image__url">
            <label htmlFor={`${fieldId}-url`} className="admin-stat-card__label">
              Image URL
            </label>
            <div className="admin-question-image-url__row">
              <input
                id={`${fieldId}-url`}
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
                Apply
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
        <div className="admin-field__error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
