/**
 * Read-only audit — detect question-option integrity violations in live DB.
 * Repair strategy: report only; never auto-fix.
 */
import { mysqlPool } from '../src/config/mysql.js';

const MCQ_KEYS = ['A', 'B', 'C', 'D'];

async function main() {
  const violations = [];

  const [orphanOptions] = await mysqlPool.query(
    `SELECT qo.id, qo.question_id
     FROM question_options qo
     LEFT JOIN question_bank qb ON qb.id = qo.question_id AND qb.deleted_at IS NULL
     WHERE qb.id IS NULL`
  );
  for (const row of orphanOptions) {
    violations.push({
      type: 'ORPHAN_OPTION',
      option_id: row.id,
      question_id: row.question_id,
    });
  }

  const [activeQuestions] = await mysqlPool.query(
    `SELECT id FROM question_bank WHERE deleted_at IS NULL AND question_type = 'mcq'`
  );

  for (const question of activeQuestions) {
    const questionId = Number(question.id);
    const [options] = await mysqlPool.query(
      `SELECT id, option_key, option_text, is_correct, question_id
       FROM question_options WHERE question_id = ?`,
      [questionId]
    );

    if (options.length !== 4) {
      violations.push({
        type: 'INVALID_OPTION_COUNT',
        question_id: questionId,
        count: options.length,
      });
    }

    const correctCount = options.filter((o) => Number(o.is_correct) === 1).length;
    if (correctCount !== 1) {
      violations.push({
        type: 'INVALID_CORRECT_COUNT',
        question_id: questionId,
        correct_count: correctCount,
      });
    }

    const keys = options.map((o) => String(o.option_key ?? '').toUpperCase());
    for (const key of MCQ_KEYS) {
      if (!keys.includes(key)) {
        violations.push({ type: 'MISSING_OPTION_KEY', question_id: questionId, option_key: key });
      }
    }

    for (const opt of options) {
      if (!String(opt.option_text ?? '').trim()) {
        violations.push({ type: 'EMPTY_OPTION_TEXT', question_id: questionId, option_id: opt.id });
      }
      if (Number(opt.question_id) !== questionId) {
        violations.push({ type: 'MAPPING_MISMATCH', question_id: questionId, option_id: opt.id });
      }
    }
  }

  if (violations.length === 0) {
    console.log('[audit-question-bank-integrity] OK — no violations found');
    process.exit(0);
  }

  console.error('[audit-question-bank-integrity] violations detected:', violations.length);
  console.error(JSON.stringify(violations, null, 2));
  process.exit(1);
}

main().catch((error) => {
  console.error('[audit-question-bank-integrity] failed', error);
  process.exit(1);
});
