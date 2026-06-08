import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import {
  loadComposedTestQuestions,
  mapComposedQuestionsForStudentAttempt,
} from '../src/services/testQuestionComposition.service.js';

const slug = process.argv[2] || 'chapter-1-12';

const [[test]] = await mysqlPool.query(
  `SELECT id, public_slug, title FROM tests WHERE public_slug = ? LIMIT 1`,
  [slug]
);
console.log('test:', test);
if (!test) {
  await mysqlPool.end();
  process.exit(0);
}

const composed = await loadComposedTestQuestions(test.id, { audience: 'student' });
const mapped = mapComposedQuestionsForStudentAttempt(composed);

console.log('composedCount:', composed.length);
console.log('mappedCount:', mapped.length);

for (const q of mapped) {
  console.log(
    JSON.stringify({
      id: q.id,
      questionTextPreview: String(q.questionText || '').replace(/<[^>]+>/g, ' ').slice(0, 80),
      optionCount: q.options?.length ?? 0,
      options: q.options,
    })
  );
}

const [optCounts] = await mysqlPool.query(
  `SELECT qb.id AS question_id, COUNT(qo.id) AS option_count
   FROM test_questions tq
   INNER JOIN question_bank qb ON qb.id = tq.question_id
   LEFT JOIN question_options qo ON qo.question_id = qb.id
   WHERE tq.test_id = ?
   GROUP BY qb.id`,
  [test.id]
);
console.log('\nDB option counts per linked question:');
for (const row of optCounts) {
  console.log(row);
}

await mysqlPool.end();
