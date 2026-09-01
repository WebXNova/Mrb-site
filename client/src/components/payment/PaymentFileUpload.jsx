import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IconUpload } from '../public-tests/testsUiIcons.jsx';

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PaymentFileUpload({
  id,
  labelledBy,
  file,
  error,
  disabled = false,
  accept = 'image/jpeg,image/png,.jpg,.jpeg,.png',
  onFileChange,
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pickFile(selected) {
    onFileChange?.(selected || null);
  }

  function onInputChange(event) {
    pickFile(event.target.files?.[0] || null);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
    pickFile(event.dataTransfer.files?.[0] || null);
  }

  function removeFile() {
    pickFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="ptp-upload">
      <input
        ref={inputRef}
        id={inputId}
        className="ptp-upload__input"
        type="file"
        accept={accept}
        onChange={onInputChange}
        disabled={disabled}
        aria-labelledby={labelledBy}
      />

      {file && previewUrl ? (
        <div className="ptp-upload__preview">
          <img src={previewUrl} alt="Selected payment screenshot preview" />
          <div className="ptp-upload__meta">
            <p className="ptp-upload__name">{file.name}</p>
            <p className="ptp-upload__size">{formatBytes(file.size)}</p>
            <div className="ptp-upload__actions">
              <button type="button" className="ptp-upload__btn" onClick={() => inputRef.current?.click()} disabled={disabled}>
                Change
              </button>
              <button type="button" className="ptp-upload__btn ptp-upload__btn--danger" onClick={removeFile} disabled={disabled}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`ptp-upload__drop${dragOver ? ' ptp-upload__drop--over' : ''}${error ? ' ptp-upload__drop--error' : ''}${
            disabled ? ' ptp-upload__drop--disabled' : ''
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <span className="ptp-upload__icon">
            <IconUpload />
          </span>
          <span className="ptp-upload__title">Upload screenshot</span>
          <span className="ptp-upload__hint">PNG or JPG · Maximum 5MB</span>
          <span className="ptp-upload__choose">Choose image</span>
        </label>
      )}
      {error ? (
        <p className="ptp-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
