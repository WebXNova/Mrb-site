import { mysqlPool } from '../config/mysql.js';

const PAGE_SIZE = 200;

const HEADERS = [
  'Username', 'Full Name', 'Father Name', 'WhatsApp Number',
  'Email', 'City', 'District', 'Fresh/Improved',
  'Test Name', 'Score Obtained', 'Total Marks', 'Percentage',
  'Time Taken', 'Submission Date',
];

export function getFullHeaders(maxQuestions) {
  const qHeaders = [];
  for (let i = 1; i <= maxQuestions; i++) {
    qHeaders.push(`Q${i}`);
  }
  return [...HEADERS, ...qHeaders];
}

export function formatTimeTaken(seconds) {
  if (seconds == null || seconds < 0) return '00:00:00';
  const total = Math.floor(Number(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatSubmissionDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

export function escapeCsv(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function buildRow(student, answerMap, maxQuestions) {
  const answers = answerMap.get(student.attempt_id) || new Map();
  const qCells = [];
  for (let i = 1; i <= maxQuestions; i++) {
    qCells.push(answers.get(i) ?? '');
  }

  const freshImproved = student.mdcat_attempt_type === 'Fresher' ? 'Fresh'
    : student.mdcat_attempt_type === 'Improver' ? 'Improved'
    : '';

  const score = student.score != null ? Number(student.score) : 0;
  const totalMarks = student.max_score != null ? Number(student.max_score) : 0;
  const pct = student.percentage != null ? Number(student.percentage).toFixed(2) : '0.00';

  return [
    student.username ?? '',
    student.full_name ?? '',
    student.father_name ?? '',
    student.whatsapp_number ?? '',
    student.email ?? '',
    student.city_name ?? '',
    student.district_name ?? '',
    freshImproved,
    student.test_title ?? '',
    score,
    totalMarks,
    pct,
    formatTimeTaken(student.time_taken_seconds),
    formatSubmissionDate(student.submitted_at),
    ...qCells,
  ];
}

export async function loadTest(testId) {
  const [rows] = await mysqlPool.query(
    `SELECT id, title, course_id FROM tests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [testId]
  );
  return rows[0] ?? null;
}

export async function getTotalQuestionCount(testId) {
  const [[row]] = await mysqlPool.query(
    `SELECT COUNT(*) AS count FROM test_questions WHERE test_id = ?`,
    [testId]
  );
  return row ? Number(row.count) : 0;
}

export async function getCompletedAttemptCount(testId) {
  const [[row]] = await mysqlPool.query(
    `SELECT COUNT(DISTINCT student_id) AS count
     FROM test_attempts
     WHERE test_id = ? AND status = 'submitted'`,
    [testId]
  );
  return row ? Number(row.count) : 0;
}

export async function loadStudentPage(testId, limit, offset) {
  const [rows] = await mysqlPool.query(
    `SELECT ranked.* FROM (
      SELECT
        a.id AS attempt_id,
        u.username,
        u.full_name,
        u.email,
        e.father_name,
        e.whatsapp_number,
        e.mdcat_attempt_type,
        ct.name AS city_name,
        d.name AS district_name,
        t.title AS test_title,
        a.submitted_at,
        a.time_taken_seconds,
        a.score,
        a.percentage,
        r.max_score,
        ROW_NUMBER() OVER (
          PARTITION BY a.student_id
          ORDER BY a.submitted_at DESC, a.id DESC
        ) AS rn
      FROM test_attempts a
      INNER JOIN tests t ON t.id = a.test_id AND t.deleted_at IS NULL
      LEFT JOIN test_results r ON r.attempt_id = a.id
      INNER JOIN users u ON u.id = a.student_id
      LEFT JOIN enrollments e ON e.user_id = u.id AND e.course_id = t.course_id
      LEFT JOIN cities ct ON ct.id = e.city_id
      LEFT JOIN districts d ON d.id = e.district_id
      WHERE a.test_id = ? AND a.status = 'submitted'
    ) ranked
    WHERE rn = 1
    ORDER BY ranked.submitted_at DESC, ranked.attempt_id DESC
    LIMIT ? OFFSET ?`,
    [testId, limit, offset]
  );
  return rows;
}

export async function loadAnswersForAttempts(testId, attemptIds) {
  if (attemptIds.length === 0) return [];
  const placeholders = attemptIds.map(() => '?').join(',');
  const [rows] = await mysqlPool.query(
    `SELECT
       a.id AS attempt_id,
       tq.display_order,
       qo.option_key AS selected_answer
     FROM test_attempts a
     INNER JOIN test_questions tq ON tq.test_id = a.test_id
     LEFT JOIN student_answers sa ON sa.attempt_id = a.id AND sa.question_id = tq.question_id
     LEFT JOIN question_options qo ON qo.id = sa.selected_option_id
     WHERE a.id IN (${placeholders})
     ORDER BY a.id, tq.display_order`,
    attemptIds
  );
  return rows;
}

export function pivotAnswers(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.attempt_id)) {
      map.set(row.attempt_id, new Map());
    }
    const raw = row.selected_answer;
    map.get(row.attempt_id).set(row.display_order, raw ? String(raw).toLowerCase() : '');
  }
  return map;
}

export function sanitizeFilename(name) {
  return String(name || 'export')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120) || 'export';
}

export function getExportFilename(testTitle, ext) {
  const ts = new Date().toISOString().replace(/[:-]/g, '').replace(/T/, '_').replace(/\..+$/, '');
  const safe = sanitizeFilename(testTitle);
  return `${safe}_${ts}.${ext}`;
}

export async function streamCsvToResponse(res, testId) {
  const test = await loadTest(testId);
  if (!test) return 0;

  const totalQuestions = await getTotalQuestionCount(testId);
  const headers = getFullHeaders(totalQuestions);

  res.write('\uFEFF');
  res.write(headers.map(escapeCsv).join(',') + '\n');

  let offset = 0;
  let totalRows = 0;

  while (true) {
    const students = await loadStudentPage(testId, PAGE_SIZE, offset);
    if (students.length === 0) break;

    const attemptIds = students.map((s) => s.attempt_id);
    const answerRows = await loadAnswersForAttempts(testId, attemptIds);
    const answerMap = pivotAnswers(answerRows);

    for (const student of students) {
      const row = buildRow(student, answerMap, totalQuestions);
      res.write(row.map(escapeCsv).join(',') + '\n');
      totalRows++;
    }

    offset += PAGE_SIZE;
  }

  return totalRows;
}

export async function buildXlsxBuffer(testId) {
  const test = await loadTest(testId);
  if (!test) return null;

  const totalQuestions = await getTotalQuestionCount(testId);
  const headers = getFullHeaders(totalQuestions);

  const { default: XLSX } = await import('xlsx');
  const wsData = [headers.map((h) => String(h))];
  const wb = XLSX.utils.book_new();

  let offset = 0;
  let rowCount = 0;

  while (true) {
    const students = await loadStudentPage(testId, PAGE_SIZE, offset);
    if (students.length === 0) break;

    const attemptIds = students.map((s) => s.attempt_id);
    const answerRows = await loadAnswersForAttempts(testId, attemptIds);
    const answerMap = pivotAnswers(answerRows);

    for (const student of students) {
      const row = buildRow(student, answerMap, totalQuestions);
      wsData.push(row.map((v) => String(v)));
      rowCount++;
    }

    offset += PAGE_SIZE;
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const colCount = headers.length;
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_col(c);
    for (let r = 0; r <= rowCount; r++) {
      const cellRef = addr + (r + 1);
      if (ws[cellRef]) {
        ws[cellRef].t = 's';
        ws[cellRef].z = '@';
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, totalRows: rowCount };
}
