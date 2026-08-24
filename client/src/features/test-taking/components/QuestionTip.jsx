import { memo, useState } from 'react';
import { sanitizeStudentRichHtml } from '../../../security/sanitizeStudentRichHtml.js';

/** Tips are collapsed by default so hints are not shown unless the student opts in. */
function QuestionTip({ tipHtml }) {
  const [open, setOpen] = useState(false);

  if (!tipHtml || !String(tipHtml).trim()) return null;

  return (
    <div className="tt-question-tip">
      <button
        type="button"
        className="tt-question-tip__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? 'Hide hint' : 'Show hint'}
      </button>
      {open ? (
        <div
          className="tt-question-tip__body rich-text"
          dangerouslySetInnerHTML={{ __html: sanitizeStudentRichHtml(tipHtml) }}
        />
      ) : null}
    </div>
  );
}

export default memo(QuestionTip);
