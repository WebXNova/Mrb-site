/**
 * Single-record Excel export for an enrollment.
 *
 * Drives content from `enrollmentFieldRegistry.js` so the workbook stays in sync with
 * the detail panel and batch exporter — every field rendered in the UI ends up in the
 * workbook and vice versa.
 */
import { ENROLLMENT_FIELD_SECTIONS, formatEnrollmentField } from './enrollmentFieldRegistry.js';

const BRAND = {
  navy: 'FF143E6B',
  navyDeep: 'FF0F2D4F',
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

function safeExportFilename(id, applicantName) {
  const slug = String(applicantName || 'applicant')
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 42);
  const stamp = new Date().toISOString().slice(0, 10);
  return `MRB-enrollment-${id}-${slug || 'record'}-${stamp}.xlsx`;
}

function styledSectionRow(worksheet, rowIndex, title) {
  worksheet.mergeCells(`A${rowIndex}:B${rowIndex}`);
  const cell = worksheet.getCell(`A${rowIndex}`);
  cell.value = title;
  cell.font = { bold: true, size: 12, color: { argb: BRAND.white } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.navyDeep } };
  cell.border = thinBorder;
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  worksheet.getRow(rowIndex).height = 24;
}

function styledPairRow(worksheet, rowIndex, label, value) {
  const a = worksheet.getCell(`A${rowIndex}`);
  const b = worksheet.getCell(`B${rowIndex}`);
  a.value = label;
  a.font = { bold: true, size: 11, color: { argb: BRAND.text } };
  a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.slate } };
  a.border = thinBorder;
  a.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };

  b.value = value === null || value === undefined || value === '' ? '-' : String(value);
  b.font = { size: 11, color: { argb: BRAND.text } };
  b.border = thinBorder;
  b.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
}

/**
 * Styled single-record Excel workbook (MRB Classes admin).
 * @param {Record<string, unknown>} enrollment From admin API
 * @param {{ formatDate?: (v: unknown) => string }} [opts] Optional formatter (used for the
 *   exported-at sub-header only; per-field values now come from the registry).
 */
export async function downloadEnrollmentDetailExcel(enrollment, opts = {}) {
  const { formatDate } = opts;
  if (!enrollment || typeof enrollment !== 'object') {
    throw new Error('Nothing to export.');
  }

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MRB Classes Admin';
  workbook.created = new Date();
  workbook.modified = new Date();

  const ws = workbook.addWorksheet('Enrollment details', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { key: 'label', width: 32 },
    { key: 'value', width: 56 },
  ];

  ws.mergeCells('A1:B1');
  const title = ws.getCell('A1');
  title.value = 'MRB Classes — Enrollment record (full details)';
  title.font = { bold: true, size: 16, color: { argb: BRAND.white } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.navy } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.border = thinBorder;
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:B2');
  const sub = ws.getCell('A2');
  const exportedAt = formatDate ? formatDate(Date.now()) : new Date().toLocaleString();
  sub.value = `Enrollment ID: ${enrollment.id ?? '-'}  ·  Exported: ${exportedAt}  ·  Status: ${String(
    enrollment.status || 'pending'
  ).toUpperCase()}`;
  sub.font = { size: 10, italic: true, color: { argb: BRAND.muted } };
  sub.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sub.border = thinBorder;
  ws.getRow(2).height = 22;

  ws.getRow(3).height = 6;

  let r = 4;
  ENROLLMENT_FIELD_SECTIONS.forEach((section) => {
    styledSectionRow(ws, r, section.title);
    r += 1;
    section.fields.forEach((field) => {
      styledPairRow(ws, r, field.label, formatEnrollmentField(field.key, enrollment));
      r += 1;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeExportFilename(enrollment.id, enrollment.applicantFullName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
