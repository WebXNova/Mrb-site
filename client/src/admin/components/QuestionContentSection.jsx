import { useRef, useState } from 'react';
import QuestionCkEditor from './QuestionCkEditor.jsx';
import { sanitizeQuestionImagePreviewUrl } from '../utils/questionImageUrlValidation.js';

const ACCEPTED_UPLOAD_TYPES = 'image/jpeg,image/png,image/webp';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Question Content card — CKEditor body + optional image upload/URL.
 */
export default function QuestionContentSection({
  form,
  imageUrlDraft,
  imageUrlDraftError,
  getFieldError,
  showError,
  onQuestionTextChange,
  onQuestionTextBlur,
  onImageUrlDraftChange,
  onApplyImageUrl,
  onUploadImage,
  onRemoveImage,
  onReplaceImage,
  disabled = false,
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const previewSrc = sanitizeQuestionImagePreviewUrl(form.questionImageUrl);
  const hasImage = Boolean(previewSrc);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    setUploadError('');
    if (!file) return;

    if (!/^(image\/(jpeg|png|webp))$/i.test(file.type)) {
      setUploadError('Only JPEG, PNG, or WebP images are allowed.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Image must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    setUploading(true);
    try {
      await onUploadImage(file);
    } catch (err) {
      setUploadError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleApplyUrl() {
    onApplyImageUrl();
  }

  function handleRemove() {
    onRemoveImage();
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleReplace() {
    onReplaceImage();
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="admin-card" aria-labelledby="question-content-heading">
      <h2 id="question-content-heading" className="heading-4">
        Question Content
      </h2>

      <div className="admin-field" style={{ marginTop: 'var(--space-4)' }}>
        <label htmlFor="question-text-editor">
          Question Text <span aria-hidden="true">*</span>
        </label>
        <QuestionCkEditor
          value={form.questionTextHtml}
          onChange={onQuestionTextChange}
          onBlur={onQuestionTextBlur}
          disabled={disabled}
          invalid={showError('questionTextHtml')}
        />
        {showError('questionTextHtml') ? (
          <div className="admin-field__error" role="alert">
            {getFieldError('questionTextHtml')}
          </div>
        ) : null}
      </div>

      <div className="admin-field" style={{ marginTop: 'var(--space-5)' }}>
        <span className="admin-field__label-block">Question Image (optional)</span>
        <p className="admin-field__hint" style={{ marginTop: '0.25rem' }}>
          Upload a file or paste an http(s) image URL. JPEG, PNG, or WebP · max 5 MB.
        </p>

        {hasImage ? (
          <div className="admin-question-image-preview">
            <img src={previewSrc} alt="Question image preview" className="admin-question-image-preview__img" />
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
              <label htmlFor="question-image-file" className="admin-stat-card__label">
                Upload image
              </label>
              <input
                id="question-image-file"
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
              <label htmlFor="question-image-url" className="admin-stat-card__label">
                Image URL
              </label>
              <div className="admin-question-image-url__row">
                <input
                  id="question-image-url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://example.com/image.png"
                  value={imageUrlDraft}
                  onChange={(e) => onImageUrlDraftChange(e.target.value)}
                  disabled={disabled || uploading}
                  aria-invalid={Boolean(imageUrlDraftError)}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={handleApplyUrl}
                  disabled={disabled || uploading || !imageUrlDraft.trim()}
                >
                  Apply URL
                </button>
              </div>
              {imageUrlDraftError ? (
                <div className="admin-field__error" role="alert">
                  {imageUrlDraftError}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {showError('questionImageUrl') ? (
          <div className="admin-field__error" role="alert" style={{ marginTop: '0.5rem' }}>
            {getFieldError('questionImageUrl')}
          </div>
        ) : null}
      </div>
    </section>
  );
}
