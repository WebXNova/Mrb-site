import { adminRoute } from '../../config/adminPaths';
import { Link } from 'react-router-dom';

function setupHref(testId, hash) {
  if (!testId) return null;
  const path = adminRoute(`tests/${testId}/settings`);
  return hash ? `${path}#${hash}` : path;
}

function mapMissingField(field, { activeStep, setupPath, questionsPath, testId }) {
  switch (field) {
    case 'quiz_draft':
      if (activeStep === 'questions') {
        return {
          text: 'Questions must sync to the server — check Saved (top right) or use Save now below.',
        };
      }
      return {
        text: 'Save questions to the server',
        link: questionsPath,
        linkLabel: 'Open Questions',
      };
    case 'questions':
      return {
        text: 'Add at least one complete question',
        link: activeStep === 'questions' ? null : questionsPath,
        linkLabel: 'Open Questions',
      };
    case 'section_labels':
      return {
        text: 'Every section marker needs a subject label',
        link: activeStep === 'questions' ? null : questionsPath,
        linkLabel: 'Open Questions',
      };
    case 'empty_section':
      return {
        text: 'A section has no questions',
        link: activeStep === 'questions' ? null : questionsPath,
        linkLabel: 'Open Questions',
      };
    case 'invalid_mcq':
      return {
        text: 'Fix invalid questions before publish',
        link: activeStep === 'questions' ? null : questionsPath,
        linkLabel: 'Open Questions',
      };
    case 'duration_minutes':
      return {
        text: 'Set duration in Settings → Access control → Time limit',
        link: activeStep === 'setup' ? setupHref(testId, 'settings-duration') : setupHref(testId, 'settings-duration'),
        linkLabel: 'Open Settings',
      };
    case 'max_attempts':
      return {
        text: 'Set max attempts in Settings → Access control → Attempt limit',
        link: setupHref(testId, 'settings-attempts'),
        linkLabel: 'Open Settings',
      };
    case 'passing_marks':
      return {
        text: 'Set passing marks in Settings → Review settings',
        link: setupPath,
        linkLabel: 'Open Settings',
      };
    case 'access_mode':
      return {
        text: 'Set access mode in Settings → Access control',
        link: setupHref(testId, 'ts-access-heading'),
        linkLabel: 'Open Settings',
      };
    case 'title':
    case 'course_id':
    case 'test_type':
    case 'category':
    case 'subject_id':
    case 'subject_ids':
    case 'basic_info':
      return {
        text: 'Complete general info in Settings',
        link: setupPath,
        linkLabel: 'Open Settings',
      };
    case 'rules':
      return {
        text: 'Complete rules & scoring in Settings',
        link: setupHref(testId, 'settings-duration'),
        linkLabel: 'Open Settings',
      };
    case 'settings':
      return {
        text: 'Complete access & timing in Settings',
        link: setupHref(testId, 'ts-access-heading'),
        linkLabel: 'Open Settings',
      };
    default:
      return {
        text: String(field).replace(/_/g, ' '),
      };
  }
}

/**
 * @param {string[]|Array<{ code?: string, message?: string, key?: string, blocking?: boolean }>} missingFields
 * @param {{ activeStep?: 'setup'|'questions'|'publish'|null, testId?: string|number|null }} [context]
 */
export function getMissingFieldItems(missingFields = [], context = {}) {
  const { activeStep = null, testId = null } = context;
  const setupPath = testId ? adminRoute(`tests/${testId}/settings`) : null;
  const questionsPath = testId ? adminRoute(`tests/${testId}/questions`) : null;

  const records = (missingFields || []).map((field) =>
    typeof field === 'object' && field
      ? field
      : { code: String(field), key: String(field), blocking: true }
  );

  return records.map((record, index) => {
    const field = String(record.code || record.field || record.key || '');
    const mapped = mapMissingField(field, { activeStep, setupPath, questionsPath, testId });
    const serverMessage = typeof record.message === 'string' && record.message.trim() ? record.message : null;
    return {
      field: String(record.key || field || index),
      text: serverMessage || mapped.text,
      link: mapped.link || null,
      linkLabel: mapped.linkLabel,
      blocking: record.blocking !== false,
    };
  });
}

export function getMissingItemsFromCompleteness(completeness, context = {}) {
  const structured = Array.isArray(completeness?.missing_requirement_items)
    ? completeness.missing_requirement_items
    : completeness?.missing_fields || [];
  const items = getMissingFieldItems(structured, context);
  const warnings = Array.isArray(completeness?.publish_warnings) ? completeness.publish_warnings : [];
  const warningKeys = new Set(items.filter((item) => item.field.startsWith('empty_section')).map((item) => item.text));
  warnings.forEach((warning, index) => {
    if (warningKeys.has(warning)) return;
    items.push({
      field: `publish_warning:${index}`,
      text: warning,
      link: context.testId ? adminRoute(`tests/${context.testId}/questions`) : null,
      linkLabel: 'Open Questions',
      blocking: false,
    });
  });
  return items;
}

/**
 * @param {{
 *   missingFields?: string[],
 *   completeness?: Record<string, unknown>|null,
 *   activeStep?: 'setup'|'questions'|'publish'|null,
 *   testId?: string|number|null,
 *   variant?: 'inline'|'list',
 * }} props
 */
export default function TestWizardMissingHint({
  missingFields = [],
  completeness = null,
  activeStep = null,
  testId = null,
  variant = 'inline',
}) {
  const items = completeness
    ? getMissingItemsFromCompleteness(completeness, { activeStep, testId })
    : getMissingFieldItems(missingFields, { activeStep, testId });

  if (!items.length) return null;

  if (variant === 'list') {
    return (
      <ul className="admin-test-readiness__list">
        {items.map((item) => (
          <li key={item.field}>
            {item.blocking === false ? <span className="admin-test-readiness__warn">Warning: </span> : null}
            {item.text}
            {item.link ? (
              <>
                {' '}
                <Link to={item.link}>{item.linkLabel || 'Fix'}</Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  const text = items.map((item) => item.text).join('; ');
  const firstLink = items.find((item) => item.link);

  return (
    <p className="admin-test-progress__hint admin-test-progress__hint--warning">
      Still needed: {text}
      {firstLink && activeStep !== 'questions' ? (
        <>
          {' '}
          <Link to={firstLink.link}>{firstLink.linkLabel}</Link>
        </>
      ) : null}
    </p>
  );
}
