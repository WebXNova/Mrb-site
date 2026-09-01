import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { adminApi } from '../../../api/adminApi';
import { getAdminToken } from '../../../auth/session';
import { adminRoute } from '../../../config/adminPaths';
import AdminToggleSwitch from '../courses/AdminToggleSwitch';
import AdminRichTextField from './AdminRichTextField.jsx';
import ScoreBandEditor from './ScoreBandEditor.jsx';
import AdminConfirmDialog from '../AdminConfirmDialog.jsx';
import SeatInventoryMeter from '../SeatInventoryMeter.jsx';
import TestWizardNav from '../TestWizardNav.jsx';
import PremiumCheckbox from '../ui/PremiumCheckbox.jsx';
import { useTestSettingsAutosave } from '../../hooks/useTestSettingsAutosave.js';
import {
  canonicalizeTestSettingsPageForm,
  defaultTestSettingsPageForm,
  mapApiToTestSettingsPageForm,
  validateTestSettingsPageForm,
} from '../../utils/testSettingsPageValidation';
import { buildTestBasicInfoPayload, mapTestToBasicInfoForm, isTestPublishedStatus } from '../../utils/testBasicInfoValidation';
import { withPublishedEditControls } from '../../utils/publishedTestEdit';
import { isStandaloneAccessType } from '../../constants/testAccessType.js';
import { formatPkrAmount, formatTestAccessTypeLabel } from '../../utils/testAdminDisplay.js';
import { formatTestStatusLabel, getTestStatusVariant } from '../TestStatusBadge.jsx';
import SettingsSectionCard, { SettingsSubsection } from './SettingsSectionCard.jsx';
import SettingsRadioCards from './SettingsRadioCards.jsx';
import {
  SettingsAffixInput,
  SettingsField,
  SettingsIdentityCard,
  SettingsNotice,
} from './SettingsField.jsx';
import SettingsStatStrip from './SettingsStatStrip.jsx';
import {
  IconAward,
  IconBanknote,
  IconCheck,
  IconClock,
  IconEye,
  IconFileText,
  IconInfo,
  IconKey,
  IconLayout,
  IconRotate,
  IconShield,
  IconStatus,
  IconTag,
  IconUsers,
} from './SettingsIcons.jsx';
import '../../styles/admin-test-settings.css';

/** @typedef {'idle' | 'saving' | 'saved' | 'error'} SaveStatus */

function cloneSettingsForm(form) {
  try {
    return JSON.parse(JSON.stringify(form));
  } catch {
    return { ...form };
  }
}

function compactAccessDescription(accessType, mode) {
  if (accessType === 'paid_standalone') {
    return mode === 'public' ? 'Approved students may start during the window.' : 'Visible, but students cannot start.';
  }
  if (accessType === 'free_standalone') {
    return mode === 'public' ? 'Students may start during the window.' : 'Visible, but students cannot start.';
  }
  return mode === 'public'
    ? 'Enrolled course students may access this test.'
    : 'Only administrators can view this test.';
}

function formatSaveStatus(autosaveStatus, autosaveError, lastSavedAt) {
  if (autosaveStatus === 'saving') return { label: 'Saving…', tone: 'saving' };
  if (autosaveStatus === 'error') return { label: autosaveError || 'Save failed', tone: 'error' };
  if (autosaveStatus === 'unsaved') return { label: 'Unsaved changes', tone: 'unsaved' };
  if (lastSavedAt) {
    const ago = Date.now() - new Date(lastSavedAt).getTime();
    if (Number.isFinite(ago) && ago >= 0 && ago < 15000) {
      return { label: 'Saved just now', tone: 'saved' };
    }
    const time = new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return { label: `Saved ${time}`, tone: 'saved' };
  }
  return { label: 'All changes saved', tone: 'saved' };
}

function formatSeatsSummary(form) {
  if (!isStandaloneAccessType(form.test_access_type)) return '—';
  const capacity = Number(form.seat_capacity);
  if (!Number.isFinite(capacity) || capacity < 1) return 'Unlimited';
  return String(capacity);
}

function formatPriceSummary(form) {
  if (form.test_access_type === 'paid_standalone') return formatPkrAmount(form.price_pkr);
  if (form.test_access_type === 'free_standalone') return 'Free';
  return '—';
}

function formatAttemptsSummary(form, scoresCount) {
  const used = Number(scoresCount) || 0;
  if (form.attempts_unlimited) return `${used} / Unlimited`;
  return `${used} / ${form.max_attempts || '—'}`;
}

/**
 * Consolidated Testmoz-style settings form.
 */
export default function TestSettingsForm() {
  const {
    testId,
    readOnly = false,
    isPublished: publishedFromLayout = false,
    refreshTest,
    testTitle: titleFromLayout = '',
  } = useOutletContext();
  const token = getAdminToken();

  const [form, setForm] = useState(defaultTestSettingsPageForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [basicInfoForm, setBasicInfoForm] = useState(null);
  const [rulesSnapshot, setRulesSnapshot] = useState({ passing_marks: 0, negative_marking: 0, totalMarks: null });
  const [settingsReady, setSettingsReady] = useState(false);
  const [isPublished, setIsPublished] = useState(Boolean(publishedFromLayout));
  const [scoresCount, setScoresCount] = useState(0);
  const [lifecycleStatus, setLifecycleStatus] = useState('');
  const [attemptEditAcknowledged, setAttemptEditAcknowledged] = useState(false);
  const [confirmPublishedOpen, setConfirmPublishedOpen] = useState(false);
  const basicInfoFormRef = useRef(basicInfoForm);
  const rulesSnapshotRef = useRef(rulesSnapshot);
  const lastSyncedFormRef = useRef(null);
  basicInfoFormRef.current = basicInfoForm;
  rulesSnapshotRef.current = rulesSnapshot;

  const persistSettings = useCallback(
    async (snapshot) => {
      if (readOnly || !basicInfoFormRef.current) {
        return { ok: false, error: 'Settings cannot be saved right now.' };
      }
      const validation = validateTestSettingsPageForm(
        {
          ...snapshot,
          title: String(snapshot.title || basicInfoFormRef.current?.title || '').trim(),
        },
        rulesSnapshotRef.current
      );
      if (!validation.ok) {
        setFieldErrors(validation.errors);
        window.requestAnimationFrame(() => {
          document.querySelector('.ts-field__error, [aria-invalid="true"]')?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        });
        return { ok: false, error: 'Fix the highlighted fields — changes are kept locally until they are valid.' };
      }
      setFieldErrors({});
      const basicPayload = buildTestBasicInfoPayload({
        ...basicInfoFormRef.current,
        title: validation.basicInfoPayload.title,
      });
      const controls = isPublished || publishedFromLayout ? { confirmPublishedEdit: true } : {};
      await adminApi.patchTestBasicInfo(token, testId, withPublishedEditControls(basicPayload, controls));
      await adminApi.patchTestRules(token, testId, withPublishedEditControls(validation.rulesPayload, controls));
      await adminApi.patchTestSettings(token, testId, withPublishedEditControls(validation.settingsPayload, controls));
      lastSyncedFormRef.current = cloneSettingsForm(snapshot);
      if (typeof refreshTest === 'function') {
        await refreshTest();
      }
      return { ok: true };
    },
    [isPublished, publishedFromLayout, readOnly, refreshTest, testId, token]
  );

  const needsAttemptConfirm = (isPublished || publishedFromLayout) && scoresCount > 0 && !attemptEditAcknowledged;

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
      const [testRes, settingsRes, rulesRes, completenessRes] = await Promise.all([
        adminApi.getTest(token, testId),
        adminApi.getTestSettings(token, testId),
        adminApi.getTestRules(token, testId),
        adminApi.getTestCompleteness(token, testId).catch(() => null),
      ]);
      const test = testRes?.data;
      if (!test) {
        setLoadError('Test not found.');
        return;
      }
      const nextBasic = mapTestToBasicInfoForm(test);
      setIsPublished(isTestPublishedStatus(test.status));
      setScoresCount(Number(test.scoresCount ?? test.scores_count ?? 0));
      setLifecycleStatus(
        completenessRes?.data?.lifecycle_status || completenessRes?.data?.lifecycleStatus || test.status || ''
      );
      const nextRules = {
        passing_marks: Number(rulesRes?.data?.passing_marks ?? 0),
        negative_marking: Number(rulesRes?.data?.negative_marking ?? 0),
        totalMarks: completenessRes?.data?.publish_summary?.total_marks ?? null,
      };
      const serverForm = mapApiToTestSettingsPageForm({ settings: settingsRes?.data, rules: rulesRes?.data });
      if (!String(serverForm.title || '').trim()) {
        serverForm.title = String(nextBasic.title || test.title || '');
      }
      setBasicInfoForm(nextBasic);
      setRulesSnapshot(nextRules);
      basicInfoFormRef.current = nextBasic;
      rulesSnapshotRef.current = nextRules;
      const pendingForm = restorePendingDraft(serverForm);
      setForm(canonicalizeTestSettingsPageForm(pendingForm || serverForm));
      lastSyncedFormRef.current = cloneSettingsForm(serverForm);
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
    if (needsAttemptConfirm) {
      setConfirmPublishedOpen(true);
      return;
    }
    await saveNow();
  }

  async function confirmPublishedAndSave() {
    setAttemptEditAcknowledged(true);
    setConfirmPublishedOpen(false);
    await saveNow();
  }

  function handleDiscard() {
    const snapshot = lastSyncedFormRef.current;
    if (!snapshot) return;
    const restored = cloneSettingsForm(snapshot);
    setFieldErrors({});
    markSynced(restored);
    setForm(restored);
  }

  const breadcrumbTitle = (form.title || titleFromLayout || '').trim() || `Test #${testId}`;
  const saveMeta = formatSaveStatus(autosaveStatus, autosaveError, lastSavedAt);
  const showStickyBar = !readOnly && (autosaveStatus === 'unsaved' || autosaveStatus === 'error');
  const resultsPath = adminRoute(`tests/${testId}/results`);
  const testsPath = adminRoute('tests');
  const standalone = isStandaloneAccessType(form.test_access_type);
  const paid = form.test_access_type === 'paid_standalone';
  const totalMarksLabel =
    rulesSnapshot.totalMarks != null && Number.isFinite(Number(rulesSnapshot.totalMarks))
      ? String(rulesSnapshot.totalMarks)
      : null;
  const statusTone = getTestStatusVariant(lifecycleStatus);

  const pageHeader = (
    <header className="ts-header">
      <div className="ts-header__main">
        <nav className="ts-crumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link to={testsPath}>Tests</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>{breadcrumbTitle}</li>
            <li aria-hidden="true">/</li>
            <li className="ts-crumb__current" aria-current="page">
              Settings
            </li>
          </ol>
        </nav>
        <h1 className="ts-header__title">Test Settings</h1>
        <p className="ts-header__subtitle">
          Configure how this test appears, behaves, and is accessed by students.
        </p>
      </div>
      {!readOnly && !isLoading && !loadError ? (
        <div className="ts-header__actions">
          <span className={`ts-save-status ts-save-status--${saveMeta.tone}`} aria-live="polite">
            {saveMeta.tone === 'saved' ? <IconCheck size={14} /> : null}
            {saveMeta.label}
          </span>
          <button className="btn btn--primary" type="submit" disabled={autosaveStatus === 'saving'}>
            {autosaveStatus === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : null}
    </header>
  );

  const pageTabs = (
    <div className="ts-tabs">
      <TestWizardNav testId={testId} activeStep="settings" />
    </div>
  );

  if (isLoading) {
    return (
      <div className="ts-page">
        {pageHeader}
        {pageTabs}
        <p className="ts-loading">Loading settings…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ts-page">
        {pageHeader}
        {pageTabs}
        <p className="ts-error">{loadError}</p>
      </div>
    );
  }

  const disabled = readOnly || autosaveStatus === 'saving';
  const outlineEnabled = Boolean(form.show_score && form.show_test_outline);

  return (
    <form className="ts-page" onSubmit={handleSave} noValidate>
      {pageHeader}

      <SettingsStatStrip
        items={[
          {
            label: 'Test type',
            value: formatTestAccessTypeLabel(form.test_access_type),
            icon: <IconTag size={16} />,
          },
          { label: 'Price', value: formatPriceSummary(form), icon: <IconBanknote size={16} /> },
          { label: 'Seats', value: formatSeatsSummary(form), icon: <IconUsers size={16} /> },
          {
            label: 'Attempts',
            value: formatAttemptsSummary(form, scoresCount),
            icon: <IconRotate size={16} />,
          },
          {
            label: 'Duration',
            value: `${form.duration_minutes || '—'} min`,
            icon: <IconClock size={16} />,
          },
          {
            label: 'Status',
            value: formatTestStatusLabel(lifecycleStatus),
            tone: statusTone,
            icon: <IconStatus size={16} />,
          },
        ]}
      />

      {pageTabs}

      {needsAttemptConfirm ? (
        <SettingsNotice tone="warning">
          <IconInfo size={16} />
          <p>This test already has student attempts. Changes apply to future attempts only.</p>
        </SettingsNotice>
      ) : null}

      <SettingsSectionCard
        titleId="ts-basic-heading"
        icon={<IconFileText size={18} />}
        title="Basic Information"
        description="Define what students see before starting the test."
      >
        <SettingsField id="test-title" label="Test name" error={fieldErrors.title}>
          <input
            id="test-title"
            className="ts-input"
            name="title"
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            disabled={disabled}
            maxLength={120}
            aria-invalid={Boolean(fieldErrors.title)}
          />
        </SettingsField>
        <SettingsField id="test-intro" label="Introduction">
          <div className="ts-rich">
            <AdminRichTextField
              editorId="test-introduction"
              value={form.introduction_html}
              onChange={(html) => updateField('introduction_html', html)}
              disabled={disabled}
              placeholder="Instructions or welcome message for students…"
              ariaLabel="Test introduction"
            />
          </div>
        </SettingsField>
      </SettingsSectionCard>

      <SettingsSectionCard
        titleId="ts-questions-heading"
        icon={<IconLayout size={18} />}
        title="Question Display"
        description="Choose how many questions students see at once during the exam. This does not change how answer options are arranged."
      >
        <SettingsRadioCards
          name="display_mode"
          ariaLabel="Question display"
          value={form.display_mode}
          onChange={(value) => updateField('display_mode', value)}
          disabled={disabled}
          columns={2}
          options={[
            {
              value: 'all',
              title: 'All Questions',
              description: 'Show all questions on one scrollable exam page.',
            },
            {
              value: 'one_per_page',
              title: 'One Question Per Page',
              description: 'Show one question at a time.',
            },
          ]}
        />

        <SettingsSubsection title="Randomization">
          <div className="ts-toggle-stack">
            <AdminToggleSwitch
              id="shuffle_questions"
              name="shuffle_questions"
              checked={Boolean(form.shuffle_questions)}
              onChange={(e) => updateField('shuffle_questions', e.target.checked)}
              label="Randomize question order"
              hint="Each attempt gets a shuffled question order. Multi-section tests shuffle within each section."
              disabled={disabled}
            />
            <AdminToggleSwitch
              id="shuffle_options"
              name="shuffle_options"
              checked={Boolean(form.shuffle_options)}
              onChange={(e) => updateField('shuffle_options', e.target.checked)}
              label="Randomize answer options"
              hint="Choice order is shuffled per attempt. Past attempts keep their original order."
              disabled={disabled}
            />
          </div>
        </SettingsSubsection>
      </SettingsSectionCard>

      <SettingsSectionCard
        titleId="ts-review-heading"
        icon={<IconEye size={18} />}
        title="Review & Results"
        description="What students see after they submit."
      >
        <SettingsSubsection title="Submission message">
          <SettingsField id="test-conclusion" label="Conclusion text">
            <div className="ts-rich">
              <AdminRichTextField
                editorId="test-conclusion"
                value={form.conclusion_html}
                onChange={(html) => updateField('conclusion_html', html)}
                disabled={disabled}
                placeholder="Message shown after submission…"
                ariaLabel="Conclusion text"
              />
            </div>
          </SettingsField>
        </SettingsSubsection>

        <SettingsSubsection title="Score visibility">
          <div className="ts-toggle-stack">
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
              hint="Display the student's score when results are released."
              disabled={disabled}
            />
          </div>
        </SettingsSubsection>

        <SettingsSubsection title="Review options">
          <div className="ts-toggle-stack">
            <AdminToggleSwitch
              id="show_test_outline"
              name="show_test_outline"
              checked={Boolean(form.show_test_outline)}
              onChange={(e) => updateField('show_test_outline', e.target.checked)}
              label="Show test outline"
              hint="Include a per-question review when results are released."
              disabled={disabled || !form.show_score}
            />
          </div>
          {outlineEnabled ? (
            <div className="ts-disclosure">
              <PremiumCheckbox
                id="show_correct_incorrect"
                name="show_correct_incorrect"
                checked={Boolean(form.show_correct_incorrect)}
                onChange={(e) => updateField('show_correct_incorrect', e.target.checked)}
                label="Indicate correct/incorrect responses"
                disabled={disabled || !form.show_score}
              />
              <PremiumCheckbox
                id="show_correct_answer"
                name="show_correct_answer"
                checked={Boolean(form.show_correct_answer)}
                onChange={(e) => updateField('show_correct_answer', e.target.checked)}
                label="Display correct answer"
                disabled={disabled || !form.show_score}
              />
              <PremiumCheckbox
                id="show_explanations"
                name="show_explanations"
                checked={Boolean(form.show_explanations)}
                onChange={(e) => updateField('show_explanations', e.target.checked)}
                label="Show explanation"
                disabled={disabled || !form.show_score}
              />
            </div>
          ) : (
            <p className="ts-field__hint">
              {form.show_score
                ? 'Turn on test outline to choose review details.'
                : 'Turn on show score to configure the review outline.'}
            </p>
          )}
          <SettingsNotice>
            <IconInfo size={16} />
            <p>Students will see their review only after results are published.</p>
          </SettingsNotice>
        </SettingsSubsection>

        <SettingsSubsection title="Results release">
          <div className="ts-results">
            <div>
              <span className="ts-results__label">Results</span>
              <p className="ts-results__value">
                <span
                  className={`ts-dot${form.results_released_at ? ' ts-dot--ok' : ''}`}
                  aria-hidden="true"
                />
                {form.results_released_at
                  ? `Published ${new Date(form.results_released_at).toLocaleString()}`
                  : 'Not published'}
              </p>
            </div>
            <p className="ts-results__hint">
              Results are published from the{' '}
              <Link to={resultsPath}>Results page</Link>.
            </p>
          </div>
        </SettingsSubsection>

        <SettingsSubsection title="Score-based feedback">
          <p className="ts-field__hint">Show custom feedback based on student scores.</p>
          <ScoreBandEditor
            bands={form.score_bands}
            onChange={(bands) => updateField('score_bands', bands)}
            disabled={disabled}
            error={fieldErrors.score_bands}
          />
        </SettingsSubsection>
      </SettingsSectionCard>

      <SettingsSectionCard
        id="ts-access-heading"
        titleId="ts-access-heading-title"
        icon={<IconKey size={18} />}
        title="Access & Availability"
        description="Who can take this test, and when."
      >
        <div className="ts-access">
          <div className="ts-access__col">
            <SettingsSubsection title="Test access">
              <p className="ts-type-label">Test type</p>
              <SettingsIdentityCard
                title={formatTestAccessTypeLabel(form.test_access_type)}
                hint="Type is set at creation. Duplicate the test to use a different access type."
              />
            </SettingsSubsection>

            <SettingsSubsection title="Test status">
              <SettingsRadioCards
                ariaLabel="Test status"
                name="access_mode"
                value={form.access_mode}
                onChange={(value) => updateField('access_mode', value)}
                disabled={disabled}
                columns={2}
                options={[
                  {
                    value: 'private',
                    title: 'Closed',
                    description: compactAccessDescription(form.test_access_type, 'private'),
                  },
                  {
                    value: 'public',
                    title: 'Open',
                    description: compactAccessDescription(form.test_access_type, 'public'),
                  },
                ]}
              />
              {form.test_access_type === 'paid_standalone' ? (
                <p className="ts-field__hint">Open/Closed is separate from payment approval and from the start/end schedule.</p>
              ) : standalone ? (
                <p className="ts-field__hint">Open/Closed is separate from the start/end schedule. Closed tests stay visible to students.</p>
              ) : null}
            </SettingsSubsection>

            {standalone ? (
              <SettingsSubsection title="Payment & seats">
                <div className="ts-field-grid">
                  {paid ? (
                    <SettingsField id="price_pkr" label="Price" error={fieldErrors.price_pkr}>
                      <SettingsAffixInput
                        id="price_pkr"
                        prefix="Rs."
                        type="number"
                        min={1}
                        value={form.price_pkr}
                        onChange={(e) => updateField('price_pkr', e.target.value)}
                        disabled={disabled}
                      />
                    </SettingsField>
                  ) : null}
                  <SettingsField
                    id="seat_capacity"
                    label="Seat capacity"
                    error={fieldErrors.seat_capacity}
                    hint={
                      paid
                        ? null
                        : Number(form.seat_capacity) < 1
                          ? 'Unlimited'
                          : 'Use 0 for unlimited seats.'
                    }
                  >
                    <SettingsAffixInput
                      id="seat_capacity"
                      type="number"
                      min={paid ? 1 : 0}
                      value={form.seat_capacity}
                      onChange={(e) => updateField('seat_capacity', e.target.value)}
                      disabled={disabled}
                    />
                  </SettingsField>
                  <SettingsField id="start_date" label="Start date & time" error={fieldErrors.start_date}>
                    <input
                      id="start_date"
                      className="ts-input"
                      type="datetime-local"
                      value={form.start_date || ''}
                      onChange={(e) => updateField('start_date', e.target.value)}
                      disabled={disabled}
                    />
                  </SettingsField>
                  <SettingsField
                    id="end_date"
                    label="End date & time"
                    error={fieldErrors.end_date}
                    hint="Independent of Open/Closed. Times are converted from your local timezone and stored as UTC."
                  >
                    <input
                      id="end_date"
                      className="ts-input"
                      type="datetime-local"
                      value={form.end_date || ''}
                      onChange={(e) => updateField('end_date', e.target.value)}
                      disabled={disabled}
                    />
                  </SettingsField>
                </div>
                <SeatInventoryMeter test={form} />
              </SettingsSubsection>
            ) : (
              <p className="ts-field__hint">
                Course-linked tests do not use start/end dates or seat limits. Access is enrollment-based.
              </p>
            )}
          </div>

          <div className="ts-access__col">
            <SettingsSubsection title="Time & attempts" id="settings-duration">
              <SettingsField
                id="duration_minutes"
                label="Duration"
                error={fieldErrors.duration_minutes}
                hint="Maximum 10 hours."
              >
                <SettingsAffixInput
                  id="duration_minutes"
                  suffix="minutes"
                  type="number"
                  min={1}
                  max={600}
                  value={form.duration_minutes}
                  onChange={(e) => updateField('duration_minutes', e.target.value)}
                  disabled={disabled}
                  aria-label="Duration in minutes"
                />
              </SettingsField>
            </SettingsSubsection>

            <SettingsSubsection id="settings-attempts">
              <fieldset className="ts-radio-cards ts-radio-cards--cols-1">
                <legend className="ts-radio-cards__legend">Attempt limit</legend>
                <div className="ts-radio-cards__grid">
                  <label
                    className={`ts-radio-card${form.attempts_unlimited ? ' ts-radio-card--selected' : ''}${
                      disabled ? ' ts-radio-card--disabled' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="attempts_mode"
                      checked={form.attempts_unlimited}
                      onChange={() => updateField('attempts_unlimited', true)}
                      disabled={disabled}
                    />
                    <span className="ts-radio-card__mark" aria-hidden="true" />
                    <span className="ts-radio-card__copy">
                      <span className="ts-radio-card__title">Unlimited</span>
                      <span className="ts-radio-card__desc">Students may retake freely.</span>
                    </span>
                  </label>
                  <label
                    className={`ts-radio-card${
                      !form.attempts_unlimited ? ' ts-radio-card--selected' : ''
                    }${disabled ? ' ts-radio-card--disabled' : ''}`}
                  >
                    <input
                      type="radio"
                      name="attempts_mode"
                      checked={!form.attempts_unlimited}
                      onChange={() => updateField('attempts_unlimited', false)}
                      disabled={disabled}
                    />
                    <span className="ts-radio-card__mark" aria-hidden="true" />
                    <span className="ts-radio-card__copy">
                      <span className="ts-radio-card__title">Limited</span>
                      <span className="ts-radio-card__extra">
                        <SettingsAffixInput
                          type="number"
                          min={1}
                          max={50}
                          value={form.max_attempts}
                          onChange={(e) => updateField('max_attempts', e.target.value)}
                          disabled={disabled || form.attempts_unlimited}
                          aria-label="Maximum attempts"
                          suffix="attempt"
                        />
                      </span>
                    </span>
                  </label>
                </div>
                {fieldErrors.max_attempts ? (
                  <div className="ts-field__error" role="alert">
                    {fieldErrors.max_attempts}
                  </div>
                ) : null}
              </fieldset>
            </SettingsSubsection>
          </div>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        titleId="ts-scoring-heading"
        icon={<IconAward size={18} />}
        title="Scoring"
        description="Configure how submitted tests are graded."
      >
        <div className="ts-scoring-grid">
          <SettingsField
            id="passing_marks"
            label="Passing marks"
            error={fieldErrors.passing_marks}
            hint={
              totalMarksLabel
                ? `Total marks required to pass. Question total: ${totalMarksLabel}.`
                : 'Total marks required to pass. 0 means every submitted attempt is marked as a pass.'
            }
          >
            <SettingsAffixInput
              id="passing_marks"
              name="passing_marks"
              suffix="marks"
              type="number"
              min={0}
              step="0.01"
              value={form.passing_marks}
              onChange={(e) => updateField('passing_marks', e.target.value)}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors.passing_marks)}
            />
          </SettingsField>
          <SettingsField
            id="negative_marking"
            label="Negative marking"
            error={fieldErrors.negative_marking}
            hint="Penalty applied to incorrect answers (0–1 of that question’s marks)."
          >
            <SettingsAffixInput
              id="negative_marking"
              name="negative_marking"
              suffix="penalty"
              type="number"
              min={0}
              max={1}
              step="0.01"
              value={form.negative_marking}
              onChange={(e) => updateField('negative_marking', e.target.value)}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors.negative_marking)}
            />
          </SettingsField>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        titleId="ts-fullpage-heading"
        icon={<IconShield size={18} />}
        title="Exam Security"
        description="Control how students interact with the exam environment."
      >
        <div className="ts-toggle-stack">
          <AdminToggleSwitch
            id="full_page_mode"
            name="full_page_mode"
            checked={Boolean(form.full_page_mode)}
            onChange={(e) => updateField('full_page_mode', e.target.checked)}
            label="Fullscreen exam"
            hint="Students take this test in the browser’s real fullscreen. They will be asked to enter fullscreen when the exam starts."
            disabled={disabled}
          />
        </div>
        <details className="ts-details">
          <summary>How it works</summary>
          <div className="ts-details__body">
            <p>
              Fullscreen uses the browser Fullscreen API so the exam fills the screen and site chrome is hidden.
              Students can continue if their device cannot enter fullscreen.
            </p>
            <p>
              Leaving the exam still counts as suspicious activity. Students get warning 1, then a final warning,
              then this test is locked for that student only. Those focus warnings apply whether fullscreen is on
              or off.
            </p>
          </div>
        </details>
      </SettingsSectionCard>

      {!readOnly && showStickyBar ? (
        <div className="ts-save-bar">
          <span className={`ts-save-status ts-save-status--${saveMeta.tone}`} aria-live="polite">
            {saveMeta.label}
          </span>
          <div className="ts-save-bar__actions">
            <button
              className="btn btn--ghost"
              type="button"
              onClick={handleDiscard}
              disabled={autosaveStatus === 'saving'}
            >
              Discard
            </button>
            <button className="btn btn--primary" type="submit" disabled={autosaveStatus === 'saving'}>
              {autosaveStatus === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={confirmPublishedOpen}
        title="Save changes to a live test?"
        message="This test already has student attempts. Your changes apply to future attempts immediately. Students who already started keep their original exam."
        confirmLabel="Save changes"
        cancelLabel="Cancel"
        busy={autosaveStatus === 'saving'}
        onConfirm={confirmPublishedAndSave}
        onCancel={() => setConfirmPublishedOpen(false)}
      />
    </form>
  );
}
