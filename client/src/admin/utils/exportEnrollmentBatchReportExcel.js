/**
 * Tabular (one-row-per-student) Excel export for admin Registrations.
 *
 * Drives columns from `enrollmentFieldRegistry.js` so this report stays aligned with
 * the per-record detail export and the admin detail panel — no field drift.
 */
import {
  ENROLLMENT_BATCH_EXPORT_COLUMNS,
  formatEnrollmentField,
  getEnrollmentBatchExportHeaders,
} from './enrollmentFieldRegistry.js';

const BRAND = {
  navy: 'FF143E6B',
  white: 'FFFFFFFF',
  slate: 'FFEEF2F7',
  text: 'FF111827',
  muted: 'FF6B7280',
};

const thinBorder = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

function safeFilenamePart(s) {
  return String(s || 'report')
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48);
}

/**
 * @param {Record<string, unknown>[]} rows Enrollment rows from API
 * @param {{ formatDate?: (v: unknown) => string, subtitle?: string, fileSlug?: string }} [opts]
 *   `formatDate` is used only for the report header; cell values now flow from the
 *   shared field registry to keep parity with the detail export.
 */
export async function downloadBatchRegistrationReportExcel(rows, opts = {}) {
  const { formatDate, subtitle, fileSlug } = opts;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No students to export.');
  }

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MRB Classes Admin';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Batch registrations', {
    views: [{ state: 'frozen', ySplit: 4 }],
    properties: { defaultRowHeight: 18 },
  });

  const headers = getEnrollmentBatchExportHeaders();
  const colCount = headers.length;

  ws.mergeCells(1, 1, 1, colCount);
  const title = ws.getCell('A1');
  title.value = 'MRB Classes Batch Registration Report';
  title.font = { bold: true, size: 16, color: { argb: BRAND.white } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.navy } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.border = thinBorder;
  ws.getRow(1).height = 36;

  ws.mergeCells(2, 1, 2, colCount);
  const sub = ws.getCell('A2');
  const exportedAt = formatDate ? formatDate(Date.now()) : new Date().toLocaleString();
  sub.value = subtitle || `Total students: ${rows.length}  ·  Exported: ${exportedAt}`;
  sub.font = { size: 11, italic: true, color: { argb: BRAND.muted } };
  sub.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sub.border = thinBorder;
  ws.getRow(2).height = Math.max(22, Math.ceil(String(sub.value).length / 90) * 16);

  ws.getRow(3).height = 6;

  const hr = ws.getRow(4);
  headers.forEach((label, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, size: 11, color: { argb: BRAND.text } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.slate } };
    cell.border = thinBorder;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  hr.height = 22;

  rows.forEach((row, idx) => {
    const r = ws.getRow(5 + idx);
    ENROLLMENT_BATCH_EXPORT_COLUMNS.forEach((key, i) => {
      const cell = r.getCell(i + 1);
      const v = formatEnrollmentField(key, row);
      cell.value = v === null || v === undefined || v === '' ? '-' : String(v);
      cell.font = { size: 11, color: { argb: BRAND.text } };
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });
    r.height = 18;
  });

  for (let c = 1; c <= colCount; c += 1) {
    let max = 12;
    ws.getColumn(c).eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value != null ? String(cell.value) : '';
      const len = raw.length;
      if (len > max) max = len;
    });
    ws.getColumn(c).width = Math.min(Math.max(max + 2, 12), 52);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilenamePart(fileSlug)}-${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
