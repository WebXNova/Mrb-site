import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { QA_SUBJECT_OPTIONS } from '../constants/qaSubjects';
import {
  countWords,
  meetsQuestionWordRules,
  minWordsRequired,
  MIN_WORDS_WITH_IMAGE,
  MIN_WORDS_TEXT_ONLY,
} from '../utils/qaQuestionValidation';
import '../student/styles/studentQaChat.css';

export default function StudentAskQuestionPage() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('physics');
  const [question, setQuestion] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const hasFile = Boolean(file);
  const words = useMemo(() => countWords(question), [question]);
  const minW = minWordsRequired(hasFile);
  const canSubmit = meetsQuestionWordRules(question, hasFile);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onPickFile(event) {
    const picked = event.target.files?.[0];
    setError('');
    if (!picked) return;
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(picked.type)) {
      setError('Please choose a JPEG, PNG, GIF, or WebP image.');
      event.target.value = '';
      return;
    }
    if (picked.size > 5 * 1024 * 1024) {
      setError('Image must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setFile(picked);
  }

  function clearFile() {
    setFile(null);
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!canSubmit) {
      setError(
        hasFile
          ? `Add at least ${MIN_WORDS_WITH_IMAGE} words to describe your image (currently ${words}).`
          : `Write at least ${MIN_WORDS_TEXT_ONLY} words in your question (currently ${words}).`,
      );
      return;
    }
    setSubmitting(true);
    try {
      let imageUrl;
      if (file) {
        const up = await studentApi.uploadQuestionImage(file);
        imageUrl = up?.data?.url;
        if (!imageUrl) {
          setError('Image upload did not return a URL. Try again.');
          return;
        }
      }
      const response = await studentApi.createQuestion({
        subject,
        body: question,
        ...(imageUrl ? { imageUrl } : {}),
      });
      const id = response?.data?.id;
      if (id != null) {
        navigate(`/dashboard/questions/${id}`, { replace: true });
        return;
      }
      setError('Unexpected response from server.');
    } catch (err) {
      setError(err.message || 'Could not send your question.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sqachat sqachat--ask">
      <div className="sqachat__toolbar">
        <Link className="btn btn--secondary btn--sm" to="/dashboard/questions">
          My chats
        </Link>
      </div>
      <form className="sqachat__shell" onSubmit={handleSubmit}>
        <header className="sqachat__header">
          <div className="sqachat__avatar" aria-hidden>
            MRB
          </div>
          <div className="sqachat__header-text">
            <h2 className="sqachat__title">Doubt desk</h2>
            <p className="sqachat__subtitle">
              Not a bot — teachers read every message (and any photo you attach) and reply from the admin panel.
            </p>
          </div>
          <div className="sqachat__status" title="Your message is queued for a human">
            <span className="sqachat__status-dot sqachat__status-dot--queue" aria-hidden />
            <span>Human queue</span>
          </div>
        </header>

        <div className="sqachat__body">
          <p className="sqachat__meta-pill">Today · new conversation</p>
          <div className="sqachat__row sqachat__row--in">
            <div className="sqachat__bubble sqachat__bubble--in">
              <div className="sqachat__bubble-label">MRB support</div>
              Hi! Pick your subject, add an optional picture, and write your doubt (at least {MIN_WORDS_TEXT_ONLY} words
              without a photo, or at least {MIN_WORDS_WITH_IMAGE} words if you attach one). We&apos;ll post the teacher
              reply here.
            </div>
          </div>
          <div className="sqachat__typing" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="sqachat__composer">
          <div className="sqachat__chips" role="group" aria-label="Subject">
            {QA_SUBJECT_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`sqachat__chip${subject === s.value ? ' sqachat__chip--active' : ''}`}
                onClick={() => setSubject(s.value)}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>

          <div className="sqachat__file-row">
            <label className="sqachat__file-label" htmlFor="qa-image">
              <span className="sqachat__file-label-text">Attach picture (optional)</span>
              <span className="sqachat__file-hint">JPEG / PNG / WebP / GIF · max 5 MB</span>
            </label>
            <div className="sqachat__file-controls">
              <input
                id="qa-image"
                className="sqachat__file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={onPickFile}
                disabled={submitting}
              />
              {file ? (
                <button type="button" className="btn btn--secondary btn--sm sqachat__file-clear" onClick={clearFile}>
                  Remove photo
                </button>
              ) : null}
            </div>
            {previewUrl ? (
              <div className="sqachat__preview-wrap">
                <img className="sqachat__preview-img" src={previewUrl} alt="Your selected attachment preview" />
              </div>
            ) : null}
          </div>

          <label className="admin-stat-card__label sqachat__label" htmlFor="qa-body">
            Your message
          </label>
          <textarea
            id="qa-body"
            className="sqachat__textarea"
            placeholder={`Write your full question (at least ${minW} words${hasFile ? ' with your photo' : ''})…`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={submitting}
            maxLength={12000}
          />
          <p className="sqachat__wordcount" aria-live="polite">
            {words} word{words === 1 ? '' : 's'}
            {hasFile ? ` · minimum ${MIN_WORDS_WITH_IMAGE} with a photo` : ` · minimum ${MIN_WORDS_TEXT_ONLY} without a photo`}
            {canSubmit ? ' · ready to send' : ''}
          </p>
          {error ? <p className="admin-error sqachat__form-error">{error}</p> : null}
          <div className="sqachat__composer-actions">
            <p className="sqachat__hint">Replies are written manually — please allow some time.</p>
            <button className="btn btn--primary btn--sm" type="submit" disabled={submitting || !canSubmit}>
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
