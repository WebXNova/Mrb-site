import { receiptMediaUrl } from '../../utils/mediaUrl';
import { batchLabel } from '../../constants/enrollmentBatches';

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

function bytesToHuman(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return '-';
  if (num < 1024) return `${Math.round(num)} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function formatGender(value) {
  if (!value) return '-';
  const normalized = String(value).toLowerCase();
  if (normalized === 'male') return 'Male';
  if (normalized === 'female') return 'Female';
  return String(value);
}

function formatDt(value, formatDate) {
  if (value === null || value === undefined || value === '') return '-';
  return formatDate?.(value) ?? String(value);
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
 * @param {{ formatDate: (v: unknown) => string }} opts
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
    { key: 'label', width: 30 },
    { key: 'value', width: 52 },
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
  sub.value = `Enrollment ID: ${enrollment.id ?? '-'}  ·  Exported: ${formatDate?.(Date.now()) ?? new Date().toLocaleString()}  ·  Status: ${String(enrollment.status || 'pending').toUpperCase()}`;
  sub.font = { size: 10, italic: true, color: { argb: BRAND.muted } };
  sub.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sub.border = thinBorder;
  ws.getRow(2).height = 22;

  ws.getRow(3).height = 6;

  let r = 4;
  styledSectionRow(ws, r, 'Applicant & contact');
  r += 1;
  styledPairRow(ws, r, 'Applicant full name', enrollment.applicantFullName);
  r += 1;
  styledPairRow(ws, r, 'Email address', enrollment.email);
  r += 1;
  styledPairRow(ws, r, "Father's name", enrollment.fatherName);
  r += 1;
  styledPairRow(ws, r, 'Date of birth', formatDt(enrollment.dateOfBirth, formatDate));
  r += 1;
  styledPairRow(ws, r, 'Gender', formatGender(enrollment.gender));
  r += 1;
  styledPairRow(ws, r, 'Batch number', enrollment.batchNumber ? batchLabel(enrollment.batchNumber) : 'Unassigned');
  r += 1;
  styledPairRow(ws, r, 'WhatsApp number', enrollment.whatsappNumber);
  r += 1;

  styledSectionRow(ws, r, 'Location & academics');
  r += 1;
  styledPairRow(ws, r, 'Province', enrollment.province);
  r += 1;
  styledPairRow(ws, r, 'District', enrollment.district);
  r += 1;
  styledPairRow(ws, r, 'HSSC status', enrollment.hsscStatus);
  r += 1;
  styledPairRow(ws, r, 'Board', enrollment.board);
  r += 1;
  styledPairRow(ws, r, 'MDCAT attempt history', enrollment.mdcatAttemptType);
  r += 1;

  styledSectionRow(ws, r, 'Fee & verification');
  r += 1;
  styledPairRow(ws, r, 'Transaction ID', enrollment.transactionId);
  r += 1;
  styledPairRow(ws, r, 'Payment method', enrollment.paymentMethod);
  r += 1;
  styledPairRow(ws, r, 'Account title', enrollment.accountTitle);
  r += 1;
  styledPairRow(ws, r, 'Verification status', enrollment.status ?? '-');
  r += 1;
  styledPairRow(ws, r, 'Admin note', enrollment.adminNote ?? '-');
  r += 1;
  styledPairRow(ws, r, 'Reviewed by (user ID)', enrollment.reviewedBy != null ? String(enrollment.reviewedBy) : '-');
  r += 1;
  styledPairRow(ws, r, 'Reviewed at', formatDt(enrollment.reviewedAt, formatDate));
  r += 1;
  styledPairRow(ws, r, 'Submitted at', formatDt(enrollment.submittedAt, formatDate));
  r += 1;
  styledPairRow(ws, r, 'Record created', formatDt(enrollment.createdAt, formatDate));
  r += 1;
  styledPairRow(ws, r, 'Last updated', formatDt(enrollment.updatedAt, formatDate));
  r += 1;

  const receiptHref = receiptMediaUrl(enrollment.receiptUrl);

  styledSectionRow(ws, r, 'Receipt file (open link in browser)');
  r += 1;
  styledPairRow(ws, r, 'Receipt URL', receiptHref || '-');
  r += 1;
  styledPairRow(ws, r, 'Original filename', enrollment.receiptOriginalName ?? '-');
  r += 1;
  styledPairRow(ws, r, 'MIME type', enrollment.receiptMimeType ?? '-');
  r += 1;
  styledPairRow(ws, r, 'File size', bytesToHuman(enrollment.receiptSizeBytes));

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
