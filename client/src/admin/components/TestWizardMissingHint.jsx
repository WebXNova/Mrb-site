import { adminRoute } from '../../config/adminPaths';
import { Link } from 'react-router-dom';

/**
 * Context-aware missing-field hints for wizard steps.
 *
 * @param {string[]} missingFields
 * @param {{ activeStep?: 'setup'|'questions'|'publish'|null, testId?: string|number|null }} [context]
 */
export function getMissingFieldItems(missingFields = [], context = {}) {
  const { activeStep = null, testId = null } = context;
  const setupPath = testId ? adminRoute(`tests/${testId}/setup`) : null;
  const questionsPath = testId ? adminRoute(`tests/${testId}/questions`) : null;

  return missingFields.map((field) => {
    switch (field) {
      case 'quiz_draft':
        if (activeStep === 'questions') {
          return {
            field,
            text: 'Questions must sync to the server — check Saved (top right) or use Save now below.',
          };
        }
        return {
          field,
          text: 'Save questions to the server',
          link: questionsPath,
          linkLabel: 'Open Questions',
        };
      case 'questions':
        return {
          field,
          text: 'Add at least one complete question',
          link: activeStep === 'questions' ? null : questionsPath,
          linkLabel: 'Open Questions',
        };
      case 'duration_minutes':
        return {
          field,
          text: 'Set duration in Setup → Rules & scoring',
          link: activeStep === 'setup' ? null : setupPath,
          linkLabel: 'Open Setup',
        };
      case 'max_attempts':
        return {
          field,
          text: 'Set max attempts in Setup → Rules & scoring',
          link: activeStep === 'setup' ? null : setupPath,
          linkLabel: 'Open Setup',
        };
      case 'access_mode':
        return {
          field,
          text: 'Set access mode in Setup → Access & timing',
          link: activeStep === 'setup' ? null : setupPath,
          linkLabel: 'Open Setup',
        };
      case 'title':
      case 'course_id':
      case 'test_type':
      case 'category':
      case 'subject_id':
      case 'subject_ids':
      case 'basic_info':
        return {
          field,
          text: 'Complete general info in Setup',
          link: activeStep === 'setup' ? null : setupPath,
          linkLabel: 'Open Setup',
        };
      case 'rules':
        return {
          field,
          text: 'Complete rules & scoring in Setup',
          link: activeStep === 'setup' ? null : setupPath,
          linkLabel: 'Open Setup',
        };
      case 'settings':
        return {
          field,
          text: 'Complete access & timing in Setup',
          link: activeStep === 'setup' ? null : setupPath,
          linkLabel: 'Open Setup',
        };
      default:
        return {
          field,
          text: String(field).replace(/_/g, ' '),
        };
    }
  });
}

/**
 * @param {{
 *   missingFields?: string[],
 *   activeStep?: 'setup'|'questions'|'publish'|null,
 *   testId?: string|number|null,
 *   variant?: 'inline'|'list',
 * }} props
 */
export default function TestWizardMissingHint({
  missingFields = [],
  activeStep = null,
  testId = null,
  variant = 'inline',
}) {
  if (!missingFields.length) return null;

  const items = getMissingFieldItems(missingFields, { activeStep, testId });

  if (variant === 'list') {
    return (
      <ul className="admin-test-readiness__list">
        {items.map((item) => (
          <li key={item.field}>
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
