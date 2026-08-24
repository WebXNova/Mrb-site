import AdminRichTextField from './AdminRichTextField.jsx';
import { createEmptyScoreBand } from '../../utils/testScoreBandValidation.js';

/**
 * @param {{
 *   bands: Array<Record<string, unknown>>,
 *   onChange: (bands: Array<Record<string, unknown>>) => void,
 *   disabled?: boolean,
 *   error?: string,
 * }} props
 */
export default function ScoreBandEditor({ bands, onChange, disabled = false, error = '' }) {
  function updateBand(index, patch) {
    onChange(bands.map((band, i) => (i === index ? { ...band, ...patch } : band)));
  }

  function removeBand(index) {
    onChange(bands.filter((_, i) => i !== index));
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
    onChange([...bands, createEmptyScoreBand(bands.length)]);
  }

  return (
    <div className="test-score-bands">
      {bands.length === 0 ? (
        <div className="test-score-bands__empty">
          <p className="test-score-bands__empty-title">No score bands yet</p>
          <p className="test-score-bands__empty-text">
            Optional ranges that show custom feedback based on the student's score.
          </p>
        </div>
      ) : (
        bands.map((band, index) => (
          <div key={band.clientId ?? band.id ?? index} className="test-score-band-row">
            <div className="test-score-band-row__header">
              <span className="test-score-band-row__number">Band {index + 1}</span>
              <div className="test-score-band-row__actions">
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
                  className="btn btn--ghost btn--sm test-score-band-row__remove"
                  disabled={disabled}
                  onClick={() => removeBand(index)}
                >
                  Remove
                </button>
              </div>
            </div>
            <div className="test-score-band-row__scores">
              <div className="admin-field">
                <label htmlFor={`band-min-${index}`}>Min score</label>
                <input
                  id={`band-min-${index}`}
                  type="number"
                  min={0}
                  step={0.01}
                  value={band.min_score}
                  onChange={(e) => updateBand(index, { min_score: e.target.value })}
                  disabled={disabled}
                />
              </div>
              <div className="admin-field">
                <label htmlFor={`band-max-${index}`}>Max score</label>
                <input
                  id={`band-max-${index}`}
                  type="number"
                  min={0}
                  step={0.01}
                  value={band.max_score}
                  onChange={(e) => updateBand(index, { max_score: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </div>
            <div className="admin-field test-score-band-row__message">
              <label htmlFor={`band-msg-${index}`}>Message</label>
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
        ))
      )}

      {error ? <div className="admin-field__error">{error}</div> : null}

      <button type="button" className="btn btn--secondary btn--sm" disabled={disabled} onClick={addBand}>
        + Add score band
      </button>
    </div>
  );
}
