import {
  AIKEN_IMPORT_OUTCOME,
  AIKEN_IMPORT_WORKFLOW_PHASE,
} from '../utils/aikenImportWorkflow.js';

/**
 * @param {import('../utils/aikenImportWorkflow.js').QuizAikenImportResult} result
 */
function resolveSummaryTone(result) {
  switch (result.outcome) {
    case AIKEN_IMPORT_OUTCOME.SUCCESS:
      return 'success';
    case AIKEN_IMPORT_OUTCOME.PARTIAL_SUCCESS:
    case AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_OFFLINE:
      return 'warning';
    case AIKEN_IMPORT_OUTCOME.ALL_DUPLICATES:
      return 'warning';
    default:
      return 'error';
  }
}

/**
 * @param {import('../utils/aikenImportWorkflow.js').AikenImportWorkflowPhase} phase
 */
function workflowPhaseLabel(phase) {
  switch (phase) {
    case AIKEN_IMPORT_WORKFLOW_PHASE.PREVIEW_RUNNING:
      return 'Preview running';
    case AIKEN_IMPORT_WORKFLOW_PHASE.PREVIEW_COMPLETE:
      return 'Preview complete';
    case AIKEN_IMPORT_WORKFLOW_PHASE.VALIDATION_FAILED:
      return 'Validation failed';
    case AIKEN_IMPORT_WORKFLOW_PHASE.ALL_DUPLICATES:
      return 'Duplicates only';
    case AIKEN_IMPORT_WORKFLOW_PHASE.READY_TO_IMPORT:
      return 'Ready to import';
    case AIKEN_IMPORT_WORKFLOW_PHASE.SAVING_DRAFT:
      return 'Saving draft';
    case AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVED:
      return 'Draft saved';
    case AIKEN_IMPORT_WORKFLOW_PHASE.DRAFT_SAVE_FAILED:
      return 'Draft save failed';
    case AIKEN_IMPORT_WORKFLOW_PHASE.BACKEND_ERROR:
      return 'Preview failed';
    default:
      return 'Idle';
  }
}

/**
 * @param {'done' | 'failed' | 'warning' | 'pending' | 'skipped'} status
 */
function stepClass(status) {
  if (status === 'done') return 'qb-aiken-summary__step qb-aiken-summary__step--done';
  if (status === 'failed') return 'qb-aiken-summary__step qb-aiken-summary__step--failed';
  if (status === 'warning') return 'qb-aiken-summary__step qb-aiken-summary__step--warning';
  if (status === 'skipped') return 'qb-aiken-summary__step qb-aiken-summary__step--skipped';
  return 'qb-aiken-summary__step';
}

/**
 * @param {import('../utils/aikenImportWorkflow.js').QuizAikenImportResult} result
 */
function buildWorkflowSteps(result) {
  const previewFailed =
    result.outcome === AIKEN_IMPORT_OUTCOME.BACKEND_ERROR ||
    result.outcome === AIKEN_IMPORT_OUTCOME.EMPTY_FILE ||
    result.outcome === AIKEN_IMPORT_OUTCOME.FILE_REJECTED;

  const previewBlocked =
    result.outcome === AIKEN_IMPORT_OUTCOME.VALIDATION_FAILED ||
    result.outcome === AIKEN_IMPORT_OUTCOME.PREVIEW_ZERO ||
    result.outcome === AIKEN_IMPORT_OUTCOME.ALL_DUPLICATES;

  const previewStatus = previewFailed ? 'failed' : previewBlocked ? 'warning' : 'done';
  const previewDetail = previewFailed
    ? result.detail
    : `${result.diagnostics.imported} of ${result.diagnostics.totalQuestions} ready from "${result.fileLabel}"`;

  const steps = [
    {
      key: 'preview',
      label: 'Preview',
      status: previewStatus,
      detail: previewDetail,
    },
  ];

  if (result.draftSaveAttempted) {
    const draftStatus = result.draftSaved
      ? 'done'
      : result.outcome === AIKEN_IMPORT_OUTCOME.DRAFT_SAVE_OFFLINE
        ? 'warning'
        : 'failed';
    steps.push({
      key: 'draft',
      label: 'Save draft',
      status: draftStatus,
      detail: result.draftSaved
        ? `${result.importedCount} ${result.importedCount === 1 ? 'question' : 'questions'} saved to this test.`
        : result.detail,
    });
  } else if (result.importedCount > 0 && result.draftSaved) {
    steps.push({
      key: 'draft',
      label: 'Save draft',
      status: 'skipped',
      detail: 'Draft sync not required in this view — questions loaded locally.',
    });
  } else if (previewBlocked || previewFailed) {
    steps.push({
      key: 'draft',
      label: 'Save draft',
      status: 'skipped',
      detail: 'Not attempted — no valid questions to save.',
    });
  }

  return steps;
}

/**
 * @param {{ result: import('../utils/aikenImportWorkflow.js').QuizAikenImportResult, onDismiss: () => void }} props
 */
export default function QuizAikenImportSummary({ result, onDismiss }) {
  const tone = resolveSummaryTone(result);
  const { diagnostics, failures, duplicateItems } = result;
  const steps = buildWorkflowSteps(result);

  return (
    <aside
      className={`qb-aiken-summary qb-aiken-summary--${tone}`}
      role="status"
      aria-live="polite"
      aria-label="Aiken import summary"
    >
      <div className="qb-aiken-summary__head">
        <div>
          <strong className="qb-aiken-summary__title">{result.headline}</strong>
          <p className="qb-aiken-summary__subtitle">{result.detail}</p>
          <p className="qb-aiken-summary__phase">
            Status: {workflowPhaseLabel(result.workflowPhase)}
          </p>
        </div>
        <button type="button" className="qb-aiken-summary__dismiss btn btn--ghost btn--sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>

      <dl className="qb-aiken-summary__stats">
        <div>
          <dt>Total Questions</dt>
          <dd>{diagnostics.totalQuestions}</dd>
        </div>
        <div>
          <dt>Parsed</dt>
          <dd>{diagnostics.parsedQuestions}</dd>
        </div>
        <div>
          <dt>Valid</dt>
          <dd>{diagnostics.validQuestions}</dd>
        </div>
        <div>
          <dt>Duplicates</dt>
          <dd>{diagnostics.duplicates}</dd>
        </div>
        <div>
          <dt>Failed</dt>
          <dd>{diagnostics.failedQuestions}</dd>
        </div>
        <div>
          <dt>Imported</dt>
          <dd>{result.importedCount}</dd>
        </div>
      </dl>

      <ol className="qb-aiken-summary__steps">
        {steps.map((step) => (
          <li key={step.key} className={stepClass(step.status)}>
            <span className="qb-aiken-summary__step-label">{step.label}</span>
            <span className="qb-aiken-summary__step-detail">{step.detail}</span>
          </li>
        ))}
      </ol>

      {duplicateItems.length > 0 ? (
        <section className="qb-aiken-summary__section" aria-label="Duplicate questions">
          <h3 className="qb-aiken-summary__section-title">
            {diagnostics.duplicates} duplicate {diagnostics.duplicates === 1 ? 'question' : 'questions'}{' '}
            detected
          </h3>
          <ul className="qb-aiken-summary__issue-list">
            {duplicateItems.map((item, index) => (
              <li key={`dup-${item.questionNumber}-${index}`} className="qb-aiken-summary__issue">
                <span className="qb-aiken-summary__issue-headline">{item.headline}</span>
                <span className="qb-aiken-summary__issue-code">{item.errorCode}</span>
                <span className="qb-aiken-summary__issue-message">{item.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {failures.length > 0 ? (
        <section className="qb-aiken-summary__section" aria-label="Import failures">
          <h3 className="qb-aiken-summary__section-title">
            {diagnostics.failedQuestions} {diagnostics.failedQuestions === 1 ? 'question' : 'questions'} with
            errors
          </h3>
          <ul className="qb-aiken-summary__issue-list">
            {failures.map((item, index) => (
              <li key={`err-${item.questionNumber}-${index}`} className="qb-aiken-summary__issue">
                <span className="qb-aiken-summary__issue-headline">{item.headline}</span>
                <span className="qb-aiken-summary__issue-code">{item.errorCode}</span>
                <span className="qb-aiken-summary__issue-message">{item.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
