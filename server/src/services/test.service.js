import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import bcrypt from 'bcryptjs';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function buildPublicLink(publicSlug) {
  if (!publicSlug) return null;
  const base = String(env.clientUrl || '').replace(/\/$/, '');
  return `${base}/tests/${publicSlug}`;
}

function generateMrbCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
}

function toTest(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subject: row.subject,
    category: row.category,
    subCategory: row.sub_category,
    durationMinutes: row.duration_minutes,
    passingMarks: row.passing_marks,
    maxAttempts: row.max_attempts,
    shuffleQuestions: !!row.shuffle_questions,
    shuffleOptions: !!row.shuffle_options,
    showExplanations: !!row.show_explanations,
    status: row.status,
    publicSlug: row.public_slug || null,
    publicLink: buildPublicLink(row.public_slug),
    hasMrbCode: !!row.mrb_code_hash,
    mrbCodeExpiresAt: row.mrb_code_expires_at || null,
    mrbCodeMaxUses: row.mrb_code_max_uses ?? null,
    mrbCodeUsedCount: row.mrb_code_used_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toQuestion(row) {
  return {
    id: row.id,
    testId: row.test_id,
    questionText: row.question_text,
    questionImageUrl: row.question_image_url,
    options: JSON.parse(row.options_json || '[]'),
    correctOption: row.correct_option,
    explanation: row.explanation,
    explanationImageUrl: row.explanation_image_url,
    marks: row.marks,
    orderIndex: row.order_index,
  };
}

function toPublicQuestion(row) {
  return {
    id: row.id,
    testId: row.test_id,
    questionText: row.question_text,
    questionImageUrl: row.question_image_url,
    options: JSON.parse(row.options_json || '[]').map((option) => ({
      id: option.id,
      text: option.text,
    })),
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

export async function getPublishedTestBySlug(publicSlug) {
  const [rows] = await mysqlPool.query(
    `SELECT * FROM tests WHERE public_slug = ? AND status = 'published' LIMIT 1`,
    [publicSlug]
  );
  const testRow = rows[0];
  if (!testRow) return null;
  const [questionRows] = await mysqlPool.query(
    `SELECT * FROM test_questions WHERE test_id = ? ORDER BY order_index ASC, id ASC`,
    [testRow.id]
  );
  return {
    ...toTest(testRow),
    questions: questionRows.map(toPublicQuestion),
  };
}

export async function createTest(payload, createdBy = null) {
  const mrbCodeHash = payload.mrbCode ? await bcrypt.hash(String(payload.mrbCode).trim(), 10) : null;
  const [result] = await mysqlPool.query(
    `INSERT INTO tests
     (title, description, subject, category, sub_category, duration_minutes, passing_marks, max_attempts, shuffle_questions, shuffle_options, show_explanations, status, mrb_code_hash, mrb_code_expires_at, mrb_code_max_uses, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.title,
      payload.description || null,
      payload.subject,
      payload.category || null,
      payload.subCategory || null,
      payload.durationMinutes,
      payload.passingMarks || null,
      payload.maxAttempts || 1,
      payload.shuffleQuestions ?? false,
      payload.shuffleOptions ?? false,
      payload.showExplanations ?? true,
      payload.status || 'draft',
      mrbCodeHash,
      payload.mrbCodeExpiresAt || null,
      payload.mrbCodeMaxUses || null,
      createdBy,
    ]
  );
  return getTestById(result.insertId);
}

export async function updateTest(testId, payload) {
  const mrbCodeHash = payload.mrbCode ? await bcrypt.hash(String(payload.mrbCode).trim(), 10) : null;
  await mysqlPool.query(
    `UPDATE tests
     SET title = ?, description = ?, subject = ?, category = ?, sub_category = ?, duration_minutes = ?, passing_marks = ?, max_attempts = ?,
         shuffle_questions = ?, shuffle_options = ?, show_explanations = ?, status = ?, mrb_code_expires_at = ?, mrb_code_max_uses = ?,
         mrb_code_hash = COALESCE(?, mrb_code_hash), updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.title,
      payload.description || null,
      payload.subject,
      payload.category || null,
      payload.subCategory || null,
      payload.durationMinutes,
      payload.passingMarks || null,
      payload.maxAttempts || 1,
      payload.shuffleQuestions ?? false,
      payload.shuffleOptions ?? false,
      payload.showExplanations ?? true,
      payload.status || 'draft',
      payload.mrbCodeExpiresAt || null,
      payload.mrbCodeMaxUses || null,
      mrbCodeHash,
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
  const [rows] = await mysqlPool.query(`SELECT id, title, public_slug FROM tests WHERE id = ? LIMIT 1`, [testId]);
  const test = rows[0];
  if (!test) return null;

  let publicSlug = test.public_slug;
  if (!publicSlug) {
    const baseSlug = `${slugify(test.title) || 'test'}-${test.id}`;
    publicSlug = baseSlug;
    let suffix = 1;
    while (true) {
      const [slugRows] = await mysqlPool.query(`SELECT id FROM tests WHERE public_slug = ? AND id <> ? LIMIT 1`, [
        publicSlug,
        testId,
      ]);
      if (!slugRows.length) break;
      suffix += 1;
      publicSlug = `${baseSlug}-${suffix}`;
    }
  }

  const [codeRows] = await mysqlPool.query(
    `SELECT mrb_code_hash FROM tests WHERE id = ? LIMIT 1`,
    [testId]
  );
  let generatedMrbCode = null;
  let mrbCodeHash = codeRows[0]?.mrb_code_hash || null;
  if (!mrbCodeHash) {
    generatedMrbCode = generateMrbCode(8);
    mrbCodeHash = await bcrypt.hash(generatedMrbCode, 10);
  }

  await mysqlPool.query(
    `UPDATE tests
     SET status = 'published', public_slug = ?, mrb_code_hash = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [publicSlug, mrbCodeHash, testId]
  );
  const publishedTest = await getTestById(testId);
  return { ...publishedTest, generatedMrbCode };
}

export async function regenerateTestMrbCode(testId) {
  const [rows] = await mysqlPool.query(`SELECT id FROM tests WHERE id = ? LIMIT 1`, [testId]);
  if (!rows[0]) return null;
  const generatedMrbCode = generateMrbCode(8);
  const mrbCodeHash = await bcrypt.hash(generatedMrbCode, 10);
  await mysqlPool.query(
    `UPDATE tests
     SET mrb_code_hash = ?, mrb_code_used_count = 0, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [mrbCodeHash, testId]
  );
  const updated = await getTestById(testId);
  return { ...updated, generatedMrbCode };
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
     (test_id, question_text, question_image_url, options_json, correct_option, explanation, explanation_image_url, marks, order_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      testId,
      payload.questionText,
      payload.questionImageUrl || null,
      JSON.stringify(payload.options),
      payload.correctOption,
      payload.explanation,
      payload.explanationImageUrl || null,
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
     SET question_text = ?, question_image_url = ?, options_json = ?, correct_option = ?, explanation = ?, explanation_image_url = ?, marks = ?, order_index = ?
     WHERE id = ?`,
    [
      payload.questionText,
      payload.questionImageUrl || null,
      JSON.stringify(payload.options),
      payload.correctOption,
      payload.explanation,
      payload.explanationImageUrl || null,
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

function normalizeOptionId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace('.', '')
    .replace(')', '');
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function validateImportedQuestion(item) {
  const errors = [];
  const rawQuestion = String(item.questionText || '').trim();
  const normalizedQuestion = stripHtml(rawQuestion);
  const normalizedOptions = Array.isArray(item.options)
    ? item.options
        .map((option) => ({
          id: normalizeOptionId(option.id),
          text: String(option.text || '').trim(),
        }))
        .filter((option) => option.id && option.text)
    : [];
  const correctOption = normalizeOptionId(item.correctOption);
  const explanation = String(item.explanation || '').trim();

  if (!normalizedQuestion) {
    errors.push('Question text is required');
  }
  if (normalizedOptions.length < 2) {
    errors.push('At least 2 valid options are required');
  }
  const uniqueOptionIds = new Set(normalizedOptions.map((option) => option.id));
  if (uniqueOptionIds.size !== normalizedOptions.length) {
    errors.push('Option ids must be unique');
  }
  if (!correctOption) {
    errors.push('Exactly one ANSWER is required');
  } else if (!normalizedOptions.some((option) => option.id === correctOption)) {
    errors.push('ANSWER must match one provided option id');
  }

  return {
    questionText: rawQuestion,
    questionImageUrl: String(item.questionImageUrl || '').trim(),
    options: normalizedOptions,
    correctOption,
    explanation,
    explanationImageUrl: String(item.explanationImageUrl || '').trim(),
    marks: Number(item.marks || 1),
    orderIndex: Number(item.orderIndex || 0),
    errors,
    valid: errors.length === 0,
  };
}

export function parseAikenPayload(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const parsed = [];
  let current = null;
  let parsedCount = 0;

  function startQuestion(questionText, sourceLine) {
    parsedCount += 1;
    current = {
      sourceOrder: parsedCount,
      sourceLine,
      questionText: String(questionText || '').trim(),
      options: [],
      correctOption: '',
      explanation: '',
      _answerCount: 0,
      _errors: [],
    };
  }

  function finalizeQuestion() {
    if (!current) return;
    if (current._answerCount === 0) {
      current._errors.push('Missing ANSWER line');
    }
    if (current._answerCount > 1) {
      current._errors.push('Multiple ANSWER lines found');
    }
    const validated = validateImportedQuestion({
      questionText: current.questionText,
      options: current.options,
      correctOption: current.correctOption,
      explanation: current.explanation,
      marks: 1,
      orderIndex: parsed.length,
    });
    const combinedErrors = [...new Set([...current._errors, ...validated.errors])];
    parsed.push({
      sourceOrder: current.sourceOrder,
      sourceLine: current.sourceLine,
      questionText: validated.questionText,
      options: validated.options,
      correctOption: validated.correctOption,
      explanation: validated.explanation,
      marks: validated.marks,
      orderIndex: parsed.length,
      valid: combinedErrors.length === 0,
      errors: combinedErrors,
    });
    current = null;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) continue;

    const optionMatch = line.match(/^([A-Za-z])[\)\.\:]\s+(.+)$/);
    const answerMatch = line.match(/^ANSWER\s*:\s*([A-Za-z])$/i);

    if (!current) {
      startQuestion(line, i + 1);
      continue;
    }

    if (optionMatch) {
      current.options.push({
        id: normalizeOptionId(optionMatch[1]),
        text: optionMatch[2].trim(),
      });
      continue;
    }

    if (answerMatch) {
      current.correctOption = normalizeOptionId(answerMatch[1]);
      current._answerCount += 1;
      finalizeQuestion();
      continue;
    }

    if (current.options.length === 0) {
      current.questionText = `${current.questionText} ${line}`.trim();
      continue;
    }

    current._errors.push(`Unrecognized line format: "${line}"`);
  }

  finalizeQuestion();

  return {
    items: parsed,
    summary: {
      total: parsed.length,
      valid: parsed.filter((item) => item.valid).length,
      invalid: parsed.filter((item) => !item.valid).length,
    },
  };
}

export async function bulkInsertImportedQuestions(testId, items) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [orderRows] = await connection.query(
      `SELECT COALESCE(MAX(order_index), -1) AS max_order FROM test_questions WHERE test_id = ?`,
      [testId]
    );
    let nextOrder = Number(orderRows[0]?.max_order ?? -1) + 1;

    const inserted = [];
    for (const rawItem of items) {
      const normalized = validateImportedQuestion(rawItem);
      if (!normalized.valid) {
        throw new Error(
          `Invalid import row at sourceOrder ${rawItem.sourceOrder || '?'}: ${normalized.errors.join(', ')}`
        );
      }
      const [result] = await connection.query(
        `INSERT INTO test_questions
         (test_id, question_text, question_image_url, options_json, correct_option, explanation, explanation_image_url, marks, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testId,
          normalized.questionText,
          normalized.questionImageUrl || null,
          JSON.stringify(normalized.options),
          normalized.correctOption,
          normalized.explanation || 'No explanation provided.',
          normalized.explanationImageUrl || null,
          normalized.marks || 1,
          nextOrder,
        ]
      );
      nextOrder += 1;
      const [rows] = await connection.query(`SELECT * FROM test_questions WHERE id = ? LIMIT 1`, [
        result.insertId,
      ]);
      if (rows[0]) inserted.push(toQuestion(rows[0]));
    }
    await connection.commit();
    return inserted;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
