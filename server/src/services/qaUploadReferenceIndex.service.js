import path from 'path';
import {
  QA_UPLOAD_NAMESPACES,
  QA_UPLOAD_REFERENCE_COLUMNS,
  QA_UPLOAD_URL_PREFIX,
} from '../constants/qaUpload.constants.js';

/**
 * Extract basename from a stored media URL.
 * @param {string|null|undefined} url
 */
export function extractUploadBasename(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.includes('..')) return null;
  const base = path.posix.basename(raw);
  if (!base || base.includes('..') || /[\\/]/.test(base)) return null;
  return base;
}

/**
 * Build LIKE suffix for transactional reference checks (`%/filename`).
 * @param {string} filename
 */
export function likeSuffixForFilename(filename) {
  const base = path.basename(String(filename || ''));
  if (!base || base.includes('..')) return null;
  return `%/${base}`;
}

function isMissingQuestionsTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' && String(error?.sqlMessage || '').includes('student_questions');
}

function isMissingColumn(error, column) {
  return error?.code === 'ER_BAD_FIELD_ERROR' && String(error?.sqlMessage || '').includes(column);
}

/**
 * Load referenced filenames per namespace from student_questions.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @returns {Promise<Record<string, Set<string>>>}
 */
export async function loadReferencedUploadIndex(db) {
  /** @type {Record<string, Set<string>>} */
  const index = Object.fromEntries(QA_UPLOAD_NAMESPACES.map((ns) => [ns, new Set()]));

  const columnSets = [
    ['attachment_url', 'audio_url', 'answer_attachment_url', 'answer_audio_url'],
    ['attachment_url', 'audio_url'],
  ];

  let rows = [];
  for (const columns of columnSets) {
    const selectList = columns.join(', ');
    try {
      const [result] = await db.query(`SELECT ${selectList} FROM student_questions`);
      rows = result;
      break;
    } catch (error) {
      if (isMissingQuestionsTable(error)) {
        return index;
      }
      if (!isMissingColumn(error, 'answer_attachment_url') && !isMissingColumn(error, 'audio_url')) {
        throw error;
      }
    }
  }

  for (const row of rows) {
    for (const ns of QA_UPLOAD_NAMESPACES) {
      const prefix = QA_UPLOAD_URL_PREFIX[ns];
      for (const col of QA_UPLOAD_REFERENCE_COLUMNS[ns]) {
        const url = row[col];
        if (!url || !String(url).startsWith(prefix)) continue;
        const base = extractUploadBasename(url);
        if (base) index[ns].add(base);
      }
    }
  }

  return index;
}

/**
 * Transactional re-check immediately before quarantine/delete.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string} namespace
 * @param {string} filename
 */
export async function isUploadStillReferenced(connection, namespace, filename) {
  const ns = String(namespace || '').trim();
  const columns = QA_UPLOAD_REFERENCE_COLUMNS[ns];
  if (!columns?.length) return true;

  const suffix = likeSuffixForFilename(filename);
  if (!suffix) return true;

  const clauses = columns.map((col) => `${col} LIKE ?`).join(' OR ');
  const params = columns.map(() => suffix);

  try {
    const [rows] = await connection.query(
      `SELECT 1 AS ok FROM student_questions WHERE (${clauses}) LIMIT 1`,
      params
    );
    return Boolean(rows[0]);
  } catch (error) {
    if (isMissingQuestionsTable(error)) return false;
    for (const col of columns) {
      if (isMissingColumn(error, col)) {
        return false;
      }
    }
    throw error;
  }
}
