import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import XLSX from 'xlsx';

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

function toTest(row) {
  let tags = [];
  try {
    tags = JSON.parse(row.tags_json || '[]');
  } catch {
    tags = [];
  }
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
    negativeMarking: Number(row.negative_marking || 0),
    shuffleQuestions: !!row.shuffle_questions,
    shuffleOptions: !!row.shuffle_options,
    showExplanations: !!row.show_explanations,
    accessMode: 'public',
    tags,
    status: row.status,
    publicSlug: row.public_slug || null,
    publicLink: buildPublicLink(row.public_slug),
    hasMrbCode: false,
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
  const tagsJson = JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []);
  const [result] = await mysqlPool.query(
    `INSERT INTO tests
     (title, description, subject, category, sub_category, duration_minutes, passing_marks, max_attempts, negative_marking, shuffle_questions, shuffle_options, show_explanations, access_mode, tags_json, status, created_by)
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
      Number(payload.negativeMarking || 0),
      payload.shuffleQuestions ?? false,
      payload.shuffleOptions ?? false,
      payload.showExplanations ?? true,
      'public',
      tagsJson,
      payload.status || 'draft',
      createdBy,
    ]
  );
  return getTestById(result.insertId);
}

export async function updateTest(testId, payload) {
  const tagsJson = JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []);
  await mysqlPool.query(
    `UPDATE tests
     SET title = ?, description = ?, subject = ?, category = ?, sub_category = ?, duration_minutes = ?, passing_marks = ?, max_attempts = ?,
         negative_marking = ?, shuffle_questions = ?, shuffle_options = ?, show_explanations = ?, access_mode = ?, tags_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP
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
      Number(payload.negativeMarking || 0),
      payload.shuffleQuestions ?? false,
      payload.shuffleOptions ?? false,
      payload.showExplanations ?? true,
      'public',
      tagsJson,
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

  await mysqlPool.query(
    `UPDATE tests
     SET status = 'published', public_slug = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [publicSlug, testId]
  );
  const publishedTest = await getTestById(testId);
  return publishedTest;
}

export async function duplicateTest(testId, createdBy = null) {
  const [rows] = await mysqlPool.query(`SELECT * FROM tests WHERE id = ? LIMIT 1`, [testId]);
  const source = rows[0];
  if (!source) return null;

  const [insertResult] = await mysqlPool.query(
    `INSERT INTO tests
     (title, description, subject, category, sub_category, duration_minutes, passing_marks, max_attempts, negative_marking, shuffle_questions, shuffle_options, show_explanations, access_mode, tags_json, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      `${source.title} (Copy)`,
      source.description,
      source.subject,
      source.category,
      source.sub_category,
      source.duration_minutes,
      source.passing_marks,
      source.max_attempts,
      Number(source.negative_marking || 0),
      source.shuffle_questions,
      source.shuffle_options,
      source.show_explanations,
      'public',
      source.tags_json || JSON.stringify([]),
      createdBy,
    ]
  );

  const newTestId = insertResult.insertId;
  const [questionRows] = await mysqlPool.query(
    `SELECT question_text, question_image_url, options_json, correct_option, explanation, explanation_image_url, marks, order_index
     FROM test_questions
     WHERE test_id = ?
     ORDER BY order_index ASC, id ASC`,
    [testId]
  );
  for (const row of questionRows) {
    await mysqlPool.query(
      `INSERT INTO test_questions
       (test_id, question_text, question_image_url, options_json, correct_option, explanation, explanation_image_url, marks, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newTestId,
        row.question_text,
        row.question_image_url,
        row.options_json,
        row.correct_option,
        row.explanation,
        row.explanation_image_url,
        row.marks,
        row.order_index,
      ]
    );
  }

  return getTestById(newTestId);
}

export async function exportTestResultsWorkbook(testId) {
  const [testRows] = await mysqlPool.query(`SELECT id, title FROM tests WHERE id = ? LIMIT 1`, [testId]);
  if (!testRows[0]) return null;

  const [attemptRows] = await mysqlPool.query(
    `SELECT a.id, COALESCE(a.student_name, u.full_name, u.username, 'Student') AS student_name,
            a.started_at, a.submitted_at, r.score, r.max_score, r.time_taken_seconds, r.detail_json
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.test_id = ?
     ORDER BY a.submitted_at DESC, a.id DESC`,
    [testId]
  );

  const maxQuestionCount = attemptRows.reduce((max, row) => {
    let detail = [];
    try {
      detail = JSON.parse(row.detail_json || '[]');
    } catch {
      detail = [];
    }
    return Math.max(max, Array.isArray(detail) ? detail.length : 0);
  }, 0);

  const header = ['Student Name', 'Score', 'Time (seconds)', 'Submitted At'];
  for (let i = 1; i <= maxQuestionCount; i += 1) header.push(`Q${i}`);

  const rows = attemptRows.map((row) => {
    let detail = [];
    try {
      detail = JSON.parse(row.detail_json || '[]');
    } catch {
      detail = [];
    }
    const scoreText = `${Number(row.score || 0)}/${Number(row.max_score || 0)}`;
    const base = [row.student_name, scoreText, Number(row.time_taken_seconds || 0), row.submitted_at];
    for (let i = 0; i < maxQuestionCount; i += 1) {
      const answer = detail[i]?.selectedOption || '';
      base.push(answer);
    }
    return base;
  });

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
  const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return {
    filename: `${slugify(testRows[0].title || 'test-results') || 'test-results'}-results.xlsx`,
    buffer: fileBuffer,
  };
}

export function parseSpreadsheetRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return rows.map((row) => ({
    questionText: row.Question || row.question || '',
    options: [
      { id: 'A', text: row['Option A'] || row.optionA || row.A || '' },
      { id: 'B', text: row['Option B'] || row.optionB || row.B || '' },
      { id: 'C', text: row['Option C'] || row.optionC || row.C || '' },
      { id: 'D', text: row['Option D'] || row.optionD || row.D || '' },
    ],
    correctOption: String(row['Correct Answer'] || row.correctAnswer || row.answer || '').trim(),
    explanation: row.Explanation || row.explanation || '',
    marks: Number(row.Marks || row.marks || 1),
  }));
}

export function parseWordRows(content) {
  const text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const blocks = text.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    let questionText = '';
    const options = [];
    let correctOption = '';
    let explanation = '';
    let inExplanation = false;

    for (const line of lines) {
      const optionMatch = line.match(/^([A-Da-d])[\)\.\:]\s+(.+)$/);
      const answerMatch = line.match(/^answer\s*[:\-]\s*([A-Da-d])$/i);
      const explanationMatch = line.match(/^explanation\s*[:\-]\s*(.*)$/i);
      const questionMatch = line.match(/^question\s*[:\-]\s*(.+)$/i);

      if (optionMatch) {
        options.push({ id: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() });
        inExplanation = false;
        continue;
      }
      if (answerMatch) {
        correctOption = answerMatch[1].toUpperCase();
        inExplanation = false;
        continue;
      }
      if (explanationMatch) {
        explanation = explanationMatch[1].trim();
        inExplanation = true;
        continue;
      }
      if (questionMatch) {
        questionText = questionMatch[1].trim();
        inExplanation = false;
        continue;
      }

      if (inExplanation) {
        explanation = `${explanation} ${line}`.trim();
      } else if (!questionText) {
        questionText = line;
      } else if (!options.length) {
        questionText = `${questionText} ${line}`.trim();
      }
    }

    return {
      questionText,
      options,
      correctOption,
      explanation,
      marks: 1,
    };
  });
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
  if (!explanation) {
    errors.push('Explanation is required');
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
          normalized.explanation,
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
