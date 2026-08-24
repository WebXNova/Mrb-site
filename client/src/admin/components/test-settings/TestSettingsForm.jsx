import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { adminApi } from '../../../api/adminApi';
import { getAdminToken } from '../../../auth/session';
import AdminToggleSwitch from '../courses/AdminToggleSwitch';
import AdminRichTextField from './AdminRichTextField.jsx';
import ScoreBandEditor from './ScoreBandEditor.jsx';
import { useTestSettingsAutosave } from '../../hooks/useTestSettingsAutosave.js';
import {
  defaultTestSettingsPageForm,
  mapApiToTestSettingsPageForm,
  validateTestSettingsPageForm,
} from '../../utils/testSettingsPageValidation';
import { buildTestBasicInfoPayload, mapTestToBasicInfoForm } from '../../utils/testBasicInfoValidation';

/** @typedef {'idle' | 'saving' | 'saved' | 'error'} SaveStatus */

/**
 * Consolidated Testmoz-style settings form.
 */
export default function TestSettingsForm() {
  const { testId, readOnly = false } = useOutletContext();
  const token = getAdminToken();

  const [form, setForm] = useState(defaultTestSettingsPageForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [basicInfoForm, setBasicInfoForm] = useState(null);
  const [rulesSnapshot, setRulesSnapshot] = useState({ passing_marks: 0, negative_marking: 0 });
  const [settingsReady, setSettingsReady] = useState(false);
  const basicInfoFormRef = useRef(basicInfoForm);
  const rulesSnapshotRef = useRef(rulesSnapshot);
  basicInfoFormRef.current = basicInfoForm;
  rulesSnapshotRef.current = rulesSnapshot;

  const persistSettings = useCallback(
    async (snapshot) => {
      if (readOnly || !basicInfoFormRef.current) {
        return { ok: false, error: 'Settings cannot be saved right now.' };
      }
      const validation = validateTestSettingsPageForm(snapshot, rulesSnapshotRef.current);
      if (!validation.ok) {
        setFieldErrors(validation.errors);
        return { ok: false, error: 'Fix the highlighted fields — changes are kept locally until they are valid.' };
      }
      setFieldErrors({});
      const basicPayload = buildTestBasicInfoPayload({ ...basicInfoFormRef.current, title: snapshot.title });
      await adminApi.patchTestBasicInfo(token, testId, basicPayload);
      await adminApi.patchTestRules(token, testId, validation.rulesPayload);
      await adminApi.patchTestSettings(token, testId, validation.settingsPayload);
      return { ok: true };
    },
    [readOnly, testId, token]
  );

  const {
    status: autosaveStatus,
    lastSavedAt,
    saveError: autosaveError,
    saveNow,
    markSynced,
    restorePendingDraft,
  } = useTestSettingsAutosave({
    testId,
    form,
    enabled: !readOnly,
    persist: persistSettings,
    isReady: settingsReady && !readOnly,
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    setSettingsReady(false);
    try {
      const [testRes, settingsRes, rulesRes] = await Promise.all([
        adminApi.getTest(token, testId),
        adminApi.getTestSettings(token, testId),
        adminApi.getTestRules(token, testId),
      ]);
      const test = testRes?.data;
      if (!test) {
        setLoadError('Test not found.');
        return;
      }
      const nextBasic = mapTestToBasicInfoForm(test);
      const nextRules = {
        passing_marks: Number(rulesRes?.data?.passing_marks ?? 0),
        negative_marking: Number(rulesRes?.data?.negative_marking ?? 0),
      };
      const serverForm = mapApiToTestSettingsPageForm({ settings: settingsRes?.data, rules: rulesRes?.data });
      setBasicInfoForm(nextBasic);
      setRulesSnapshot(nextRules);
      basicInfoFormRef.current = nextBasic;
      rulesSnapshotRef.current = nextRules;
      const pendingForm = restorePendingDraft(serverForm);
      setForm(pendingForm || serverForm);
      if (!pendingForm) {
        markSynced(serverForm);
      }
    } catch (err) {
      setLoadError(err.message || 'Failed to load settings.');
    } finally {
      setIsLoading(false);
      setSettingsReady(true);
    }
  }, [markSynced, restorePendingDraft, testId, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const hash = window.location.hash?.replace('#', '');
    if (!hash || isLoading) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (readOnly) return;
    await saveNow();
  }

  if (isLoading) {
    return <p className="body-md admin-courses__muted">Loading settings…</p>;
  }

  if (loadError) {
    return <p className="admin-error">{loadError}</p>;
  }

  const disabled = readOnly || autosaveStatus === 'saving';
  const saveStatusLabel =
    autosaveStatus === 'saving'
      ? 'Saving…'
      : autosaveStatus === 'error'
        ? autosaveError || 'Save failed'
        : autosaveStatus === 'unsaved'
          ? 'Unsaved changes — autosaving…'
          : lastSavedAt
            ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'Saved';

  return (
    <form className="test-settings-page" onSubmit={handleSave} noValidate>
      <section className="test-settings-section" aria-labelledby="ts-basic-heading">
        <h2 id="ts-basic-heading" className="test-settings-section__title">
          Basic settings
        </h2>
        <p className="test-settings-section__lead">
          Test name and introduction shown to students before they start.
        </p>
        <div className="test-settings-fields">
          <div className="admin-field">
            <label htmlFor="test-title">Test name</label>
            <input
              id="test-title"
              name="title"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              disabled={disabled}
              maxLength={120}
              aria-invalid={Boolean(fieldErrors.title)}
            />
            {fieldErrors.title ? <div className="admin-field__error">{fieldErrors.title}</div> : null}
          </div>
          <div className="admin-field">
            <label htmlFor="test-intro">Introduction</label>
            <AdminRichTextField
              editorId="test-introduction"
              value={form.introduction_html}
              onChange={(html) => updateField('introduction_html', html)}
              disabled={disabled}
              placeholder="Instructions or welcome message for students…"
              ariaLabel="Test introduction"
            />
          </div>
        </div>
      </section>

      <section className="test-settings-section" aria-labelledby="ts-questions-heading">
        <h2 id="ts-questions-heading" className="test-settings-section__title">
          Question settings
        </h2>
        <p className="test-settings-section__lead">How questions are displayed during the test.</p>
        <div className="test-settings-fields">
          <fieldset className="test-settings-option-group">
            <legend className="test-settings-option-group__legend">Pagination</legend>
            <div className="test-settings-option-group__options">
              <label className="test-settings-option">
                <input
                  type="radio"
                  name="display_mode"
                  value="all"
                  checked={form.display_mode === 'all'}
                  onChange={() => updateField('display_mode', 'all')}
                  disabled={disabled}
                />
                <span>Show all questions on one page</span>
              </label>
              <label className="test-settings-option">
                <input
                  type="radio"
                  name="display_mode"
                  value="one_per_page"
                  checked={form.display_mode === 'one_per_page'}
                  onChange={() => updateField('display_mode', 'one_per_page')}
                  disabled={disabled}
                />
                <span>Show one item per page</span>
              </label>
            </div>
          </fieldset>

          <fieldset className="test-settings-option-group">
            <legend className="test-settings-option-group__legend">Layout</legend>
            <div className="test-settings-option-group__options">
              <label className="test-settings-option">
                <input
                  type="radio"
                  name="layout_mode"
                  value="vertical"
                  checked={form.layout_mode === 'vertical'}
                  onChange={() => updateField('layout_mode', 'vertical')}
                  disabled={disabled}
                />
                <span>Vertical</span>
              </label>
              <label className="test-settings-option">
                <input
                  type="radio"
                  name="layout_mode"
                  value="horizontal"
                  checked={form.layout_mode === 'horizontal'}
                  onChange={() => updateField('layout_mode', 'horizontal')}
                  disabled={disabled}
                />
                <span>Horizontal</span>
              </label>
            </div>
          </fieldset>

          <AdminToggleSwitch
            id="shuffle_questions"
            name="shuffle_questions"
            checked={Boolean(form.shuffle_questions)}
            onChange={(e) => updateField('shuffle_questions', e.target.checked)}
            label="Randomize question order"
            hint="Each attempt receives questions in a randomized order (stable for that attempt)."
            disabled={disabled}
          />
        </div>
      </section>

      <section className="test-settings-section" aria-labelledby="ts-review-heading">
        <h2 id="ts-review-heading" className="test-settings-section__title">
          Review settings
        </h2>
        <p className="test-settings-section__lead">What students see after they submit.</p>
        <div className="test-settings-fields">
          <div className="admin-field">
            <label htmlFor="test-conclusion">Conclusion text</label>
            <AdminRichTextField
              editorId="test-conclusion"
              value={form.conclusion_html}
              onChange={(html) => updateField('conclusion_html', html)}
              disabled={disabled}
              placeholder="Message shown after submission…"
              ariaLabel="Conclusion text"
            />
          </div>

          <div className="test-settings-toggle-stack">
            <AdminToggleSwitch
              id="show_score"
              name="show_score"
              checked={Boolean(form.show_score)}
              onChange={(e) => {
                const checked = e.target.checked;
                setForm((prev) => ({
                  ...prev,
                  show_score: checked,
                  show_result_immediately: checked,
                  show_test_outline: checked ? prev.show_test_outline : false,
                }));
              }}
              label="Show score"
              disabled={disabled}
            />
            <AdminToggleSwitch
              id="show_test_outline"
              name="show_test_outline"
              checked={Boolean(form.show_test_outline)}
              onChange={(e) => updateField('show_test_outline', e.target.checked)}
              label="Show test outline"
              hint="Include a per-question review section when results are released."
              disabled={disabled || !form.show_score}
            />
            <div className="test-settings-toggle-stack__nested">
              <AdminToggleSwitch
                id="show_correct_incorrect"
                name="show_correct_incorrect"
                checked={Boolean(form.show_correct_incorrect)}
                onChange={(e) => updateField('show_correct_incorrect', e.target.checked)}
                label="Indicate if their response was correct or incorrect"
                disabled={disabled || !form.show_score}
              />
              <AdminToggleSwitch
                id="show_correct_answer"
                name="show_correct_answer"
                checked={Boolean(form.show_correct_answer)}
                onChange={(e) => updateField('show_correct_answer', e.target.checked)}
                label="Display the correct answer"
                disabled={disabled || !form.show_score}
              />
              <AdminToggleSwitch
                id="show_explanations"
                name="show_explanations"
                checked={Boolean(form.show_explanations)}
                onChange={(e) => updateField('show_explanations', e.target.checked)}
                label="Show explanation"
                disabled={disabled || !form.show_score}
              />
            </div>
          </div>

          <div className="admin-field">
            <span className="admin-field__label">Results release status</span>
            <p className="admin-field__hint">
              {form.results_released_at
                ? `Released on ${new Date(form.results_released_at).toLocaleString()}`
                : 'Not released — use the Publish or Results page to release results to students.'}
            </p>
          </div>

          <div className="test-settings-score-bands-block">
            <div className="test-settings-score-bands-block__head">
              <span className="admin-field__label">Score-based feedback bands</span>
              <p className="admin-field__hint">
                Add score ranges with custom messages shown after submission (e.g. pass/fail feedback).
              </p>
            </div>
            <ScoreBandEditor
              bands={form.score_bands}
              onChange={(bands) => updateField('score_bands', bands)}
              disabled={disabled}
              error={fieldErrors.score_bands}
            />
          </div>
        </div>
      </section>

      <section className="test-settings-section" aria-labelledby="ts-access-heading">
        <h2 id="ts-access-heading" className="test-settings-section__title">
          Access control
        </h2>
        <p className="test-settings-section__lead">Who can take the test, and for how long.</p>
        <div className="test-settings-access-grid">
          <fieldset className="test-settings-option-group">
            <legend className="test-settings-option-group__legend">Who can take this test?</legend>
            <div className="test-settings-option-group__options">
              <label className="test-settings-option">
                <input
                  type="radio"
                  name="access_mode"
                  value="private"
                  checked={form.access_mode === 'private'}
                  onChange={() => updateField('access_mode', 'private')}
                  disabled={disabled}
                />
                <span>Private (enrolled students only)</span>
              </label>
              <label className="test-settings-option">
                <input
                  type="radio"
                  name="access_mode"
                  value="public"
                  checked={form.access_mode === 'public'}
                  onChange={() => updateField('access_mode', 'public')}
                  disabled={disabled}
                />
                <span>Public</span>
              </label>
            </div>
          </fieldset>

          <div className="test-settings-access-grid__limits">
            <fieldset className="test-settings-option-group" id="settings-duration">
              <legend className="test-settings-option-group__legend">Time limit</legend>
              <div className="test-settings-option-group__options">
                <label className="test-settings-option">
                  <input
                    type="radio"
                    name="duration_mode"
                    checked={form.duration_unlimited}
                    onChange={() => updateField('duration_unlimited', true)}
                    disabled={disabled}
                  />
                  <span>Unlimited</span>
                </label>
                <label className="test-settings-option test-settings-option--inline">
                  <input
                    type="radio"
                    name="duration_mode"
                    checked={!form.duration_unlimited}
                    onChange={() => updateField('duration_unlimited', false)}
                    disabled={disabled}
                  />
                  <span>Limited —</span>
                  <input
                    type="number"
                    className="test-settings-inline-input"
                    min={1}
                    max={600}
                    value={form.duration_minutes}
                    onChange={(e) => updateField('duration_minutes', e.target.value)}
                    disabled={disabled || form.duration_unlimited}
                    aria-label="Duration in minutes"
                  />
                  <span>minutes</span>
                </label>
                {fieldErrors.duration_minutes ? (
                  <div className="admin-field__error">{fieldErrors.duration_minutes}</div>
                ) : null}
              </div>
            </fieldset>

            <fieldset className="test-settings-option-group" id="settings-attempts">
              <legend className="test-settings-option-group__legend">Attempt limit</legend>
              <div className="test-settings-option-group__options">
                <label className="test-settings-option">
                  <input
                    type="radio"
                    name="attempts_mode"
                    checked={form.attempts_unlimited}
                    onChange={() => updateField('attempts_unlimited', true)}
                    disabled={disabled}
                  />
                  <span>Unlimited</span>
                </label>
                <label className="test-settings-option test-settings-option--inline">
                  <input
                    type="radio"
                    name="attempts_mode"
                    checked={!form.attempts_unlimited}
                    onChange={() => updateField('attempts_unlimited', false)}
                    disabled={disabled}
                  />
                  <span>Limited to</span>
                  <input
                    type="number"
                    className="test-settings-inline-input test-settings-inline-input--sm"
                    min={1}
                    max={50}
                    value={form.max_attempts}
                    onChange={(e) => updateField('max_attempts', e.target.value)}
                    disabled={disabled || form.attempts_unlimited}
                    aria-label="Maximum attempts"
                  />
                  <span>times</span>
                </label>
                {fieldErrors.max_attempts ? (
                  <div className="admin-field__error">{fieldErrors.max_attempts}</div>
                ) : null}
              </div>
            </fieldset>
          </div>
        </div>
      </section>

      <section className="test-settings-section" aria-labelledby="ts-fullpage-heading">
        <h2 id="ts-fullpage-heading" className="test-settings-section__title">
          Full page mode
        </h2>
        <p className="test-settings-section__lead">Optional anti-cheating controls for the student exam.</p>
        <AdminToggleSwitch
          id="full_page_mode"
          name="full_page_mode"
          checked={Boolean(form.full_page_mode)}
          onChange={(e) => updateField('full_page_mode', e.target.checked)}
          label="Enable full page / anti-cheating mode"
          hint="When enabled, the student test runs in enforced fullscreen. Tab switches and fullscreen exits are tracked; the test auto-submits after the 3rd violation."
          disabled={disabled}
        />
      </section>

      {!readOnly ? (
        <div className="test-settings-save-bar">
          <span
            className={`test-settings-save-status${
              autosaveStatus === 'error'
                ? ' test-settings-save-status--error'
                : autosaveStatus === 'saved'
                  ? ' test-settings-save-status--saved'
                  : autosaveStatus === 'unsaved'
                    ? ' test-settings-save-status--unsaved'
                    : ''
            }`}
            aria-live="polite"
          >
            {saveStatusLabel}
          </span>
          <button className="btn btn--ghost" type="submit" disabled={autosaveStatus === 'saving'}>
            {autosaveStatus === 'saving' ? 'Saving…' : 'Save now'}
          </button>
        </div>
      ) : null}
    </form>
  );
}
