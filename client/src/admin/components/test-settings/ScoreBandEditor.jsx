import { useState } from 'react';
import AdminRichTextField from './AdminRichTextField.jsx';
import { createEmptyScoreBand } from '../../utils/testScoreBandValidation.js';

function htmlToPlain(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function bandKey(band, index) {
  return String(band.clientId ?? band.id ?? `idx-${index}`);
}

function formatBandRange(band) {
  const min = String(band.min_score ?? '').trim();
  const max = String(band.max_score ?? '').trim();
  if (min === '' && max === '') return 'New band';
  if (min === '') return `Up to ${max}`;
  if (max === '') return `${min}+`;
  return `${min}–${max}`;
}

/**
 * @param {{
 *   bands: Array<Record<string, unknown>>,
 *   onChange: (bands: Array<Record<string, unknown>>) => void,
 *   disabled?: boolean,
 *   error?: string,
 * }} props
 */
export default function ScoreBandEditor({ bands, onChange, disabled = false, error = '' }) {
  const [editingKey, setEditingKey] = useState(null);

  function updateBand(index, patch) {
    onChange(bands.map((band, i) => (i === index ? { ...band, ...patch } : band)));
  }

  function removeBand(index) {
    const key = bandKey(bands[index], index);
    onChange(bands.filter((_, i) => i !== index));
    if (editingKey === key) setEditingKey(null);
  }

  function moveBand(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= bands.length) return;
    const next = [...bands];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  function addBand() {
    const nextBand = createEmptyScoreBand(bands.length);
    onChange([...bands, nextBand]);
    setEditingKey(nextBand.clientId);
  }

  return (
    <div className="ts-bands">
      {bands.length === 0 ? (
        <div className="ts-bands__empty">
          <p className="ts-bands__empty-title">No score bands configured</p>
          <p className="ts-bands__empty-text">Show custom feedback based on student scores.</p>
        </div>
      ) : (
        bands.map((band, index) => {
          const key = bandKey(band, index);
          const isEditing = editingKey === key;
          const preview = htmlToPlain(band.message_html);

          if (!isEditing) {
            return (
              <div key={key} className="ts-band-summary">
                <div className="ts-band-summary__text">
                  <p className="ts-band-summary__range">{formatBandRange(band)}</p>
                  <p className="ts-band-summary__message">{preview || 'No message yet'}</p>
                </div>
                <div className="ts-band-summary__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={disabled}
                    onClick={() => setEditingKey(key)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm ts-band-summary__delete"
                    disabled={disabled}
                    onClick={() => removeBand(index)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={key} className="ts-band-edit">
              <div className="ts-band-edit__header">
                <span className="ts-band-edit__label">Band {index + 1}</span>
                <div className="ts-band-edit__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={disabled || index === 0}
                    onClick={() => moveBand(index, -1)}
                    aria-label="Move band up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={disabled || index === bands.length - 1}
                    onClick={() => moveBand(index, 1)}
                    aria-label="Move band down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={disabled}
                    onClick={() => setEditingKey(null)}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm ts-band-summary__delete"
                    disabled={disabled}
                    onClick={() => removeBand(index)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="ts-band-edit__scores">
                <div className="ts-field">
                  <label className="ts-field__label" htmlFor={`band-min-${index}`}>
                    Min score
                  </label>
                  <input
                    id={`band-min-${index}`}
                    className="ts-input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={band.min_score}
                    onChange={(e) => updateBand(index, { min_score: e.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div className="ts-field">
                  <label className="ts-field__label" htmlFor={`band-max-${index}`}>
                    Max score
                  </label>
                  <input
                    id={`band-max-${index}`}
                    className="ts-input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={band.max_score}
                    onChange={(e) => updateBand(index, { max_score: e.target.value })}
                    disabled={disabled}
                  />
                </div>
              </div>
              <div className="ts-field">
                <label className="ts-field__label" htmlFor={`band-msg-${index}`}>
                  Message
                </label>
                <AdminRichTextField
                  editorId={`score-band-${index}`}
                  value={String(band.message_html ?? '')}
                  onChange={(html) => updateBand(index, { message_html: html })}
                  disabled={disabled}
                  placeholder="Message for this score range…"
                  ariaLabel={`Score band ${index + 1} message`}
                  compact
                />
              </div>
            </div>
          );
        })
      )}

      {error ? (
        <div className="ts-field__error" role="alert">
          {error}
        </div>
      ) : null}

      <button type="button" className="btn btn--secondary btn--sm" disabled={disabled} onClick={addBand}>
        + Add score band
      </button>
    </div>
  );
}
