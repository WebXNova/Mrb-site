import { mysqlPool } from '../config/mysql.js';

function toTest(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subject: row.subject,
    durationMinutes: row.duration_minutes,
    passingMarks: row.passing_marks,
    maxAttempts: row.max_attempts,
    shuffleQuestions: !!row.shuffle_questions,
    shuffleOptions: !!row.shuffle_options,
    showExplanations: !!row.show_explanations,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toQuestion(row) {
  return {
    id: row.id,
    testId: row.test_id,
    questionText: row.question_text,
    options: JSON.parse(row.options_json || '[]'),
    correctOption: row.correct_option,
    explanation: row.explanation,
    marks: row.marks,
    orderIndex: row.order_index,
  };
}

export async function listTests() {
  const [rows] = await mysqlPool.query(`SELECT * FROM tests ORDER BY created_at DESC`);
  return rows.map(toTest);
}

export async function getTestById(testId) {
  const [rows] = await mysqlPool.query(`SELECT * FROM tests WHERE id = ? LIMIT 1`, [testId]);
  return rows[0] ? toTest(rows[0]) : null;
}

export async function createTest(payload, createdBy = null) {
  const [result] = await mysqlPool.query(
    `INSERT INTO tests
     (title, description, subject, duration_minutes, passing_marks, max_attempts, shuffle_questions, shuffle_options, show_explanations, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.title,
      payload.description || null,
      payload.subject,
      payload.durationMinutes,
      payload.passingMarks || null,
      payload.maxAttempts || 1,
      payload.shuffleQuestions ?? false,
      payload.shuffleOptions ?? false,
      payload.showExplanations ?? true,
      payload.status || 'draft',
      createdBy,
    ]
  );
  return getTestById(result.insertId);
}

export async function updateTest(testId, payload) {
  await mysqlPool.query(
    `UPDATE tests
     SET title = ?, description = ?, subject = ?, duration_minutes = ?, passing_marks = ?, max_attempts = ?,
         shuffle_questions = ?, shuffle_options = ?, show_explanations = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.title,
      payload.description || null,
      payload.subject,
      payload.durationMinutes,
      payload.passingMarks || null,
      payload.maxAttempts || 1,
      payload.shuffleQuestions ?? false,
      payload.shuffleOptions ?? false,
      payload.showExplanations ?? true,
      payload.status || 'draft',
      testId,
    ]
  );
  return getTestById(testId);
}

export async function deleteTest(testId) {
  const [result] = await mysqlPool.query(`DELETE FROM tests WHERE id = ?`, [testId]);
  return result.affectedRows > 0;
}

export async function publishTest(testId) {
  await mysqlPool.query(`UPDATE tests SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    testId,
  ]);
  return getTestById(testId);
}

export async function listTestQuestions(testId) {
  const [rows] = await mysqlPool.query(
    `SELECT * FROM test_questions WHERE test_id = ? ORDER BY order_index ASC, id ASC`,
    [testId]
  );
  return rows.map(toQuestion);
}

export async function createTestQuestion(testId, payload) {
  const [orderRows] = await mysqlPool.query(
    `SELECT COALESCE(MAX(order_index), -1) AS max_order FROM test_questions WHERE test_id = ?`,
    [testId]
  );
  const nextOrder = Number(orderRows[0]?.max_order ?? -1) + 1;
  const [result] = await mysqlPool.query(
    `INSERT INTO test_questions
     (test_id, question_text, options_json, correct_option, explanation, marks, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      testId,
      payload.questionText,
      JSON.stringify(payload.options),
      payload.correctOption,
      payload.explanation,
      payload.marks || 1,
      payload.orderIndex ?? nextOrder,
    ]
  );
  const [rows] = await mysqlPool.query(`SELECT * FROM test_questions WHERE id = ? LIMIT 1`, [result.insertId]);
  return rows[0] ? toQuestion(rows[0]) : null;
}

export async function updateTestQuestion(questionId, payload) {
  await mysqlPool.query(
    `UPDATE test_questions
     SET question_text = ?, options_json = ?, correct_option = ?, explanation = ?, marks = ?, order_index = ?
     WHERE id = ?`,
    [
      payload.questionText,
      JSON.stringify(payload.options),
      payload.correctOption,
      payload.explanation,
      payload.marks || 1,
      payload.orderIndex ?? 0,
      questionId,
    ]
  );
  const [rows] = await mysqlPool.query(`SELECT * FROM test_questions WHERE id = ? LIMIT 1`, [questionId]);
  return rows[0] ? toQuestion(rows[0]) : null;
}

export async function deleteTestQuestion(questionId) {
  const [result] = await mysqlPool.query(`DELETE FROM test_questions WHERE id = ?`, [questionId]);
  return result.affectedRows > 0;
}
