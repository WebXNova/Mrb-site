/**
 * Professional MRB Classes Result Excel Export
 *
 * Generates a branded, dashboard-style XLSX workbook matching the
 * MRB_Classes_Results_Professional.xlsx master template design.
 *
 * Two sheets:
 *   1. Dashboard  — logo, title, KPI cards, result snapshot table, performance guide
 *   2. Results    — formatted data table with alternating rows, borders, freeze panes
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Branding Palette ───────────────────────────────────────────────────────

const C = {
  navy:        '1B3A5C',
  darkBlue:    '2E5090',
  mediumBlue:  '4472C4',
  lightBlue:   'D6E4F0',
  paleBlue:    'E9EFF7',
  accentGold:  'BF8F00',
  white:       'FFFFFF',
  black:       '000000',
  darkGray:    '333333',
  mediumGray:  '808080',
  lightGray:   'F2F2F2',
  borderGray:  'B4C6E7',
  successGreen:'548235',
  successBg:   'E2EFDA',
  warningAmber:'ED7D31',
  warningBg:   'FFF2CC',
  dangerRed:   'C00000',
  dangerBg:    'FCE4EC',
  kpiBlue:     '2E75B6',
  kpiBlueBg:   'DAEEF3',
  kpiGreenBg:  'E2EFDA',
  kpiAmberBg:  'FFF2CC',
  kpiRedBg:    'FCE4EC',
};

// ─── Shared Font Helpers ────────────────────────────────────────────────────

const FONT_FAMILY = 'Calibri';

const fonts = {
  title:        { name: FONT_FAMILY, size: 18, bold: true, color: { argb: C.white } },
  subtitle:     { name: FONT_FAMILY, size: 11, italic: true, color: { argb: C.white } },
  kpiLabel:     { name: FONT_FAMILY, size: 10, bold: true, color: { argb: C.darkGray } },
  kpiValue:     { name: FONT_FAMILY, size: 22, bold: true, color: { argb: C.navy } },
  sectionTitle: { name: FONT_FAMILY, size: 12, bold: true, color: { argb: C.navy } },
  tableHeader:  { name: FONT_FAMILY, size: 10, bold: true, color: { argb: C.white } },
  tableData:    { name: FONT_FAMILY, size: 10, color: { argb: C.darkGray } },
  tableDataBold:{ name: FONT_FAMILY, size: 10, bold: true, color: { argb: C.darkGray } },
  bandLabel:    { name: FONT_FAMILY, size: 10, bold: true },
  bandDesc:     { name: FONT_FAMILY, size: 10, italic: true, color: { argb: C.mediumGray } },
  metricLabel:  { name: FONT_FAMILY, size: 10, bold: true, color: { argb: C.darkGray } },
  metricValue:  { name: FONT_FAMILY, size: 10, color: { argb: C.darkGray } },
  footer:       { name: FONT_FAMILY, size: 8, italic: true, color: { argb: C.mediumGray } },
};

// ─── Border Helpers ─────────────────────────────────────────────────────────

const thinBorder = { style: 'thin', color: { argb: C.borderGray } };
const allThinBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
const bottomMedium = { bottom: { style: 'medium', color: { argb: C.navy } } };

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

// ─── Logo Resolver ──────────────────────────────────────────────────────────

function resolveLogoPath() {
  const candidates = [
    path.resolve(__dirname, '..', 'assets', 'brand', 'mrb-logo-icon.png'),
    path.resolve(__dirname, '..', '..', 'assets', 'brand', 'mrb-logo-icon.png'),
    path.resolve(__dirname, '..', '..', '..', 'client', 'public', 'brand', 'mrb-logo-icon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ─── Utility ────────────────────────────────────────────────────────────────

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safePct(v) {
  return safeNum(v, 0);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(safeNum(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day = d.getDate();
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year}, ${hh}:${mm}`;
}

function getPerformanceBand(pct) {
  const p = safeNum(pct);
  if (p >= 90) return { label: 'OUTSTANDING', color: C.successGreen, bg: C.successBg };
  if (p >= 80) return { label: 'EXCELLENT', color: C.successGreen, bg: C.successBg };
  if (p >= 70) return { label: 'VERY GOOD', color: C.kpiBlue, bg: C.kpiBlueBg };
  if (p >= 60) return { label: 'GOOD', color: C.mediumBlue, bg: C.kpiBlueBg };
  if (p >= 50) return { label: 'AVERAGE', color: C.warningAmber, bg: C.warningBg };
  if (p >= 33) return { label: 'BELOW AVERAGE', color: C.warningAmber, bg: C.warningBg };
  return { label: 'NEEDS IMPROVEMENT', color: C.dangerRed, bg: C.dangerBg };
}

// ─── Dashboard Sheet Builder ────────────────────────────────────────────────

async function buildDashboardSheet(workbook, { testTitle, students, maxQuestions }) {
  const ws = workbook.addWorksheet('Dashboard', {
    properties: { tabColor: { argb: C.navy } },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: '&L&8MRB Classes — Confidential&C&8Page &P of &N&R&8Generated: &D &T',
    },
  });

  // Column widths (A-N = 14 columns for the dashboard layout)
  ws.columns = [
    { width: 22 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 3  }, { width: 14 },
    { width: 18 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 },
  ];

  let rowIdx = 1;

  // ── Logo ──────────────────────────────────────────────────
  const logoPath = resolveLogoPath();
  if (logoPath) {
    const logoId = workbook.addImage({
      filename: logoPath,
      extension: 'png',
    });
    ws.addImage(logoId, {
      tl: { col: 0, row: 0 },
      ext: { width: 72, height: 72 },
      editAs: 'absolute',
    });
  }

  // ── Title Banner (rows 1-2) ───────────────────────────────
  ws.mergeCells('A1:N2');
  const titleCell = ws.getCell('A1');
  titleCell.value = `MRB CLASSES  |  RESULTS DASHBOARD`;
  titleCell.font = fonts.title;
  titleCell.fill = solidFill(C.navy);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 25;
  ws.getRow(2).height = 25;

  // Fill the merged region's visible cells
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(1, c);
    cell.fill = solidFill(C.navy);
    const cell2 = ws.getCell(2, c);
    cell2.fill = solidFill(C.navy);
  }

  // ── Subtitle (row 3) ─────────────────────────────────────
  rowIdx = 3;
  ws.mergeCells('A3:N3');
  const subCell = ws.getCell('A3');
  subCell.value = `Executive view of student test performance`;
  subCell.font = fonts.subtitle;
  subCell.fill = solidFill(C.darkBlue);
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 22;
  for (let c = 1; c <= 14; c++) {
    ws.getCell(3, c).fill = solidFill(C.darkBlue);
  }

  // ── Test Name (row 4) ────────────────────────────────────
  rowIdx = 4;
  ws.mergeCells('A4:N4');
  const testNameCell = ws.getCell('A4');
  testNameCell.value = testTitle || 'Test Results';
  testNameCell.font = { name: FONT_FAMILY, size: 13, bold: true, color: { argb: C.navy } };
  testNameCell.alignment = { horizontal: 'center', vertical: 'middle' };
  testNameCell.border = bottomMedium;
  ws.getRow(4).height = 28;

  // ── Spacer row ────────────────────────────────────────────
  rowIdx = 5;
  ws.getRow(5).height = 8;

  // ── KPI Cards (rows 6-8) ─────────────────────────────────
  const totalStudents = students.length;
  const scores = students.map(s => safeNum(s.score));
  const pcts = students.map(s => safePct(s.percentage));
  const avgScore = totalStudents > 0 ? (scores.reduce((a, b) => a + b, 0) / totalStudents) : 0;
  const avgPct = totalStudents > 0 ? (pcts.reduce((a, b) => a + b, 0) / totalStudents) : 0;
  const topScore = totalStudents > 0 ? Math.max(...scores) : 0;
  const passCount = students.filter(s => safePct(s.percentage) >= 50).length;
  const passRate = totalStudents > 0 ? (passCount / totalStudents) * 100 : 0;

  const kpis = [
    { label: 'SUBMISSIONS', value: totalStudents, bg: C.kpiBlueBg, cols: [1, 3] },
    { label: 'AVG. SCORE', value: avgScore.toFixed(1), bg: C.kpiGreenBg, cols: [4, 6] },
    { label: 'AVG. %', value: avgPct.toFixed(1) + '%', bg: C.kpiAmberBg, cols: [7, 7] },
    { label: 'TOP SCORE', value: topScore, bg: C.kpiBlueBg, cols: [9, 11] },
    { label: 'PASS RATE', value: passRate.toFixed(0) + '%', bg: C.kpiGreenBg, cols: [12, 14] },
  ];

  // KPI label row (row 6)
  rowIdx = 6;
  ws.getRow(6).height = 20;
  const kpiLabelMerges = [
    ['A6','C6'], ['D6','F6'], ['G6','G6'], ['I6','K6'], ['L6','N6'],
  ];
  for (let i = 0; i < kpis.length; i++) {
    const kpi = kpis[i];
    const merge = kpiLabelMerges[i];
    if (merge[0] !== merge[1]) ws.mergeCells(`${merge[0]}:${merge[1]}`);
    const cell = ws.getCell(merge[0]);
    cell.value = kpi.label;
    cell.font = fonts.kpiLabel;
    cell.fill = solidFill(kpi.bg);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: thinBorder, left: thinBorder, right: thinBorder };
  }

  // KPI value rows (rows 7-8, merged)
  const kpiValMerges = [
    ['A7','C8'], ['D7','F8'], ['G7','G8'], ['I7','K8'], ['L7','N8'],
  ];
  ws.getRow(7).height = 28;
  ws.getRow(8).height = 28;
  for (let i = 0; i < kpis.length; i++) {
    const kpi = kpis[i];
    const merge = kpiValMerges[i];
    ws.mergeCells(`${merge[0]}:${merge[1]}`);
    const cell = ws.getCell(merge[0]);
    cell.value = kpi.value;
    cell.font = fonts.kpiValue;
    cell.fill = solidFill(kpi.bg);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: thinBorder, left: thinBorder, right: thinBorder };
  }

  // Column H (8) is a spacer between AVG.% and TOP SCORE
  for (let r = 6; r <= 8; r++) {
    ws.getCell(r, 8).fill = solidFill(C.white);
  }

  // ── Spacer ────────────────────────────────────────────────
  rowIdx = 9;
  ws.getRow(9).height = 10;

  // ── Section Headers (row 10) ──────────────────────────────
  rowIdx = 10;
  ws.mergeCells('A10:F10');
  const snapHeader = ws.getCell('A10');
  snapHeader.value = 'LATEST RESULT SNAPSHOT';
  snapHeader.font = fonts.sectionTitle;
  snapHeader.border = bottomMedium;
  ws.getRow(10).height = 22;

  ws.mergeCells('I10:N10');
  const guideHeader = ws.getCell('I10');
  guideHeader.value = 'PERFORMANCE GUIDE';
  guideHeader.font = fonts.sectionTitle;
  guideHeader.border = bottomMedium;

  // ── Snapshot Table Header (row 11) ────────────────────────
  rowIdx = 11;
  const snapCols = ['Student', 'Test', 'Score', 'Percentage', 'City', 'Submitted'];
  ws.getRow(11).height = 20;
  for (let i = 0; i < snapCols.length; i++) {
    const cell = ws.getCell(11, i + 1);
    cell.value = snapCols[i];
    cell.font = fonts.tableHeader;
    cell.fill = solidFill(C.navy);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = allThinBorders;
  }

  // Guide header (row 11)
  const guideCols = ['Band', 'Interpretation'];
  const guideColNums = [9, 10];
  for (let i = 0; i < guideCols.length; i++) {
    const cell = ws.getCell(11, guideColNums[i]);
    cell.value = guideCols[i];
    cell.font = fonts.tableHeader;
    cell.fill = solidFill(C.navy);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = allThinBorders;
  }
  ws.mergeCells('J11:N11');

  // ── Snapshot Data Rows (up to 15 students) ────────────────
  const displayStudents = students.slice(0, 15);
  for (let i = 0; i < displayStudents.length; i++) {
    const s = displayStudents[i];
    const r = 12 + i;
    const isAlt = i % 2 === 1;
    const rowFill = isAlt ? solidFill(C.lightGray) : solidFill(C.white);
    const band = getPerformanceBand(s.percentage);
    ws.getRow(r).height = 18;

    const vals = [
      s.full_name || s.username || 'Student',
      testTitle || '',
      `${safeNum(s.score)}/${safeNum(s.max_score)}`,
      safePct(s.percentage).toFixed(2) + '%',
      s.city_name || '',
      formatDate(s.submitted_at),
    ];

    for (let c = 0; c < vals.length; c++) {
      const cell = ws.getCell(r, c + 1);
      cell.value = vals[c];
      cell.font = c === 0 ? fonts.tableDataBold : fonts.tableData;
      cell.fill = rowFill;
      cell.alignment = { horizontal: c >= 2 ? 'center' : 'left', vertical: 'middle', wrapText: true };
      cell.border = allThinBorders;
    }

    // Conditional color on percentage cell
    const pctCell = ws.getCell(r, 4);
    pctCell.font = { ...fonts.tableDataBold, color: { argb: band.color } };
  }

  // ── Performance Guide Bands ───────────────────────────────
  const bands = [
    { range: '90–100%', label: 'Outstanding', color: C.successGreen, bg: C.successBg },
    { range: '80–89%',  label: 'Excellent',   color: C.successGreen, bg: C.successBg },
    { range: '70–79%',  label: 'Very Good',   color: C.kpiBlue,      bg: C.kpiBlueBg },
    { range: '60–69%',  label: 'Good',         color: C.mediumBlue,   bg: C.kpiBlueBg },
    { range: '50–59%',  label: 'Average',      color: C.warningAmber, bg: C.warningBg },
    { range: '33–49%',  label: 'Below Average', color: C.warningAmber, bg: C.warningBg },
    { range: 'Below 33%', label: 'Needs Improvement', color: C.dangerRed, bg: C.dangerBg },
  ];

  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const r = 12 + i;
    ws.getRow(r).height = Math.max(ws.getRow(r).height || 18, 18);

    const bandCell = ws.getCell(r, 9);
    bandCell.value = b.range;
    bandCell.font = { ...fonts.bandLabel, color: { argb: b.color } };
    bandCell.fill = solidFill(b.bg);
    bandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    bandCell.border = allThinBorders;

    ws.mergeCells(r, 10, r, 14);
    const descCell = ws.getCell(r, 10);
    descCell.value = b.label;
    descCell.font = fonts.bandDesc;
    descCell.fill = solidFill(b.bg);
    descCell.alignment = { horizontal: 'center', vertical: 'middle' };
    descCell.border = allThinBorders;
  }

  // ── Summary Metrics (below snapshot) ──────────────────────
  const metricsStartRow = Math.max(12 + displayStudents.length, 20) + 1;

  ws.mergeCells(metricsStartRow, 1, metricsStartRow, 6);
  const metricsSectionCell = ws.getCell(metricsStartRow, 1);
  metricsSectionCell.value = 'TEST SUMMARY METRICS';
  metricsSectionCell.font = fonts.sectionTitle;
  metricsSectionCell.border = bottomMedium;
  ws.getRow(metricsStartRow).height = 22;

  const metrics = [
    ['Test Name', testTitle || '—'],
    ['Total Questions', maxQuestions || 0],
    ['Total Submissions', totalStudents],
    ['Average Score', avgScore.toFixed(2)],
    ['Average Percentage', avgPct.toFixed(2) + '%'],
    ['Highest Score', topScore],
    ['Lowest Score', totalStudents > 0 ? Math.min(...scores) : 0],
    ['Pass Rate (≥50%)', passRate.toFixed(1) + '%'],
    ['Students Passed', passCount],
    ['Students Failed', totalStudents - passCount],
  ];

  for (let i = 0; i < metrics.length; i++) {
    const r = metricsStartRow + 1 + i;
    const isAlt = i % 2 === 0;
    ws.getRow(r).height = 18;

    const labelCell = ws.getCell(r, 1);
    labelCell.value = metrics[i][0];
    labelCell.font = fonts.metricLabel;
    labelCell.fill = isAlt ? solidFill(C.paleBlue) : solidFill(C.white);
    labelCell.border = allThinBorders;
    labelCell.alignment = { vertical: 'middle' };

    const valCell = ws.getCell(r, 2);
    valCell.value = metrics[i][1];
    valCell.font = fonts.metricValue;
    valCell.fill = isAlt ? solidFill(C.paleBlue) : solidFill(C.white);
    valCell.border = allThinBorders;
    valCell.alignment = { vertical: 'middle' };
  }

  // ── Score Distribution (to right of metrics) ──────────────
  ws.mergeCells(metricsStartRow, 9, metricsStartRow, 14);
  const distHeader = ws.getCell(metricsStartRow, 9);
  distHeader.value = 'SCORE DISTRIBUTION';
  distHeader.font = fonts.sectionTitle;
  distHeader.border = bottomMedium;

  const distHeaderRow = metricsStartRow + 1;
  const distCols = ['Range', 'Count', '%'];
  const distColNums = [9, 10, 11];
  for (let i = 0; i < distCols.length; i++) {
    const cell = ws.getCell(distHeaderRow, distColNums[i]);
    cell.value = distCols[i];
    cell.font = fonts.tableHeader;
    cell.fill = solidFill(C.navy);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = allThinBorders;
  }

  const distRanges = [
    { label: '90-100%', min: 90, max: 100, bg: C.successBg },
    { label: '80-89%',  min: 80, max: 89,  bg: C.successBg },
    { label: '70-79%',  min: 70, max: 79,  bg: C.kpiBlueBg },
    { label: '60-69%',  min: 60, max: 69,  bg: C.kpiBlueBg },
    { label: '50-59%',  min: 50, max: 59,  bg: C.warningBg },
    { label: 'Below 50%', min: 0, max: 49,  bg: C.dangerBg },
  ];

  for (let i = 0; i < distRanges.length; i++) {
    const dr = distRanges[i];
    const r = distHeaderRow + 1 + i;
    const count = students.filter(s => {
      const p = safePct(s.percentage);
      return p >= dr.min && p <= dr.max;
    }).length;
    const pctOfTotal = totalStudents > 0 ? ((count / totalStudents) * 100).toFixed(1) : '0.0';
    ws.getRow(r).height = 18;

    const rangeCell = ws.getCell(r, 9);
    rangeCell.value = dr.label;
    rangeCell.font = fonts.tableDataBold;
    rangeCell.fill = solidFill(dr.bg);
    rangeCell.alignment = { horizontal: 'center', vertical: 'middle' };
    rangeCell.border = allThinBorders;

    const countCell = ws.getCell(r, 10);
    countCell.value = count;
    countCell.font = fonts.tableData;
    countCell.fill = solidFill(dr.bg);
    countCell.alignment = { horizontal: 'center', vertical: 'middle' };
    countCell.border = allThinBorders;

    const pctCell = ws.getCell(r, 11);
    pctCell.value = pctOfTotal + '%';
    pctCell.font = fonts.tableData;
    pctCell.fill = solidFill(dr.bg);
    pctCell.alignment = { horizontal: 'center', vertical: 'middle' };
    pctCell.border = allThinBorders;
  }

  // ── Footer ────────────────────────────────────────────────
  const footerRow = metricsStartRow + metrics.length + 3;
  ws.mergeCells(footerRow, 1, footerRow, 14);
  const fCell = ws.getCell(footerRow, 1);
  fCell.value = `Report generated on ${new Date().toLocaleString()} — MRB Classes | Confidential`;
  fCell.font = fonts.footer;
  fCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // ── Print area ────────────────────────────────────────────
  ws.pageSetup.printArea = `A1:N${footerRow}`;

  return ws;
}

// ─── Results Sheet Builder ──────────────────────────────────────────────────

function buildResultsSheet(workbook, { testTitle, students, answersByAttempt, maxQuestions }) {
  const ws = workbook.addWorksheet('Results', {
    properties: { tabColor: { argb: C.mediumBlue } },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: '&L&8MRB Classes&C&8Page &P of &N&R&8&D',
    },
  });

  let rowIdx = 1;

  // ── Logo + Title Header (rows 1-2) ────────────────────────
  const logoPath = resolveLogoPath();
  if (logoPath) {
    const logoId = workbook.addImage({
      filename: logoPath,
      extension: 'png',
    });
    ws.addImage(logoId, {
      tl: { col: 0, row: 0 },
      ext: { width: 50, height: 50 },
      editAs: 'absolute',
    });
  }

  const headerCols = 14 + maxQuestions;
  const lastColLetter = getColLetter(headerCols);

  ws.mergeCells(`A1:${lastColLetter}1`);
  const hCell = ws.getCell('A1');
  hCell.value = `MRB CLASSES  |  ${(testTitle || 'Test').toUpperCase()} — RESULTS`;
  hCell.font = { name: FONT_FAMILY, size: 14, bold: true, color: { argb: C.white } };
  hCell.fill = solidFill(C.navy);
  hCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;
  for (let c = 1; c <= headerCols; c++) {
    ws.getCell(1, c).fill = solidFill(C.navy);
  }

  ws.mergeCells(`A2:${lastColLetter}2`);
  const subRow = ws.getCell('A2');
  subRow.value = `Generated: ${formatDate(new Date().toISOString())}  |  Total Students: ${students.length}  |  Questions: ${maxQuestions}`;
  subRow.font = { name: FONT_FAMILY, size: 9, italic: true, color: { argb: C.white } };
  subRow.fill = solidFill(C.darkBlue);
  subRow.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;
  for (let c = 1; c <= headerCols; c++) {
    ws.getCell(2, c).fill = solidFill(C.darkBlue);
  }

  // ── Column Headers (row 3) ────────────────────────────────
  rowIdx = 3;
  const headers = [
    'S.No', 'Username', 'Full Name', 'Father Name', 'WhatsApp',
    'Email', 'City', 'District', 'Fresh/Improved',
    'Score', 'Total Marks', 'Percentage', 'Time Taken', 'Submitted',
  ];
  for (let q = 1; q <= maxQuestions; q++) {
    headers.push(`Q${q}`);
  }

  // Column widths
  const colWidths = [
    6, 16, 22, 20, 16,
    28, 14, 14, 14,
    10, 12, 12, 12, 20,
  ];
  for (let q = 0; q < maxQuestions; q++) {
    colWidths.push(5);
  }

  for (let i = 0; i < colWidths.length; i++) {
    if (ws.columns[i]) {
      ws.getColumn(i + 1).width = colWidths[i];
    } else {
      ws.getColumn(i + 1).width = colWidths[i];
    }
  }

  ws.getRow(3).height = 24;
  for (let c = 0; c < headers.length; c++) {
    const cell = ws.getCell(3, c + 1);
    cell.value = headers[c];
    cell.font = fonts.tableHeader;
    cell.fill = solidFill(C.navy);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = allThinBorders;
  }

  // ── Data Rows ─────────────────────────────────────────────
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const r = 4 + i;
    const isAlt = i % 2 === 1;
    const rowFill = isAlt ? solidFill(C.lightGray) : solidFill(C.white);
    ws.getRow(r).height = 18;

    const freshImproved = s.mdcat_attempt_type === 'Fresher' ? 'Fresh'
      : s.mdcat_attempt_type === 'Improver' ? 'Improved'
      : '';

    const score = safeNum(s.score);
    const totalMarks = safeNum(s.max_score);
    const pct = safePct(s.percentage);
    const band = getPerformanceBand(pct);

    const answers = answersByAttempt.get(s.attempt_id) || new Map();
    const qCells = [];
    for (let q = 1; q <= maxQuestions; q++) {
      qCells.push(answers.get(q) ?? '');
    }

    const rowData = [
      i + 1,
      s.username || '',
      s.full_name || '',
      s.father_name || '',
      s.whatsapp_number || '',
      s.email || '',
      s.city_name || '',
      s.district_name || '',
      freshImproved,
      score,
      totalMarks,
      pct,
      formatTime(s.time_taken_seconds),
      formatDate(s.submitted_at),
      ...qCells,
    ];

    for (let c = 0; c < rowData.length; c++) {
      const cell = ws.getCell(r, c + 1);
      cell.value = rowData[c];
      cell.fill = rowFill;
      cell.border = allThinBorders;
      cell.alignment = { vertical: 'middle', wrapText: false };

      // Column-specific formatting
      if (c === 0) {
        cell.font = fonts.tableData;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (c === 2) {
        cell.font = fonts.tableDataBold;
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (c === 9 || c === 10) {
        cell.font = fonts.tableDataBold;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = '0.##';
      } else if (c === 11) {
        cell.font = { ...fonts.tableDataBold, color: { argb: band.color } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = '0.00"%"';
      } else if (c >= 14) {
        cell.font = { ...fonts.tableData, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.font = fonts.tableData;
        cell.alignment = { horizontal: c >= 9 ? 'center' : 'left', vertical: 'middle' };
      }
    }
  }

  // ── Freeze Panes ──────────────────────────────────────────
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 3, activeCell: 'D4' }];

  // ── Auto-filter ───────────────────────────────────────────
  const lastDataRow = 3 + students.length;
  ws.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: lastDataRow, column: headers.length },
  };

  // ── Conditional Formatting on Percentage column (col 12) ──
  if (students.length > 0) {
    ws.addConditionalFormatting({
      ref: `L4:L${lastDataRow}`,
      rules: [
        {
          type: 'cellIs',
          operator: 'greaterThanOrEqual',
          formulae: [80],
          priority: 1,
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.successBg } } },
        },
        {
          type: 'cellIs',
          operator: 'between',
          formulae: [50, 79.99],
          priority: 2,
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.warningBg } } },
        },
        {
          type: 'cellIs',
          operator: 'lessThan',
          formulae: [50],
          priority: 3,
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.dangerBg } } },
        },
      ],
    });
  }

  return ws;
}

// ─── Column Letter Utility ──────────────────────────────────────────────────

function getColLetter(colNum) {
  let result = '';
  let n = colNum;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

// ─── Main Export Function ───────────────────────────────────────────────────

/**
 * Build a professional XLSX buffer for a test's results.
 *
 * @param {{
 *   testTitle: string,
 *   testId: number,
 *   students: Array<Record<string, unknown>>,
 *   answersByAttempt: Map<number, Map<number, string>>,
 *   maxQuestions: number,
 * }} data
 * @returns {Promise<{ buffer: Buffer, totalRows: number }>}
 */
export async function buildProfessionalXlsx({ testTitle, testId, students, answersByAttempt, maxQuestions }) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'MRB Classes';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.lastPrinted = new Date();
  workbook.company = 'MRB Classes';
  workbook.description = `Professional test results report for "${testTitle || 'Test'}"`;

  await buildDashboardSheet(workbook, {
    testTitle: testTitle || 'Test',
    students,
    maxQuestions,
  });

  buildResultsSheet(workbook, {
    testTitle: testTitle || 'Test',
    students,
    answersByAttempt,
    maxQuestions,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), totalRows: students.length };
}
