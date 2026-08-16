/**
 * Course category metadata — enum validation, defaults, audit snapshots, labels.
 *
 * Run: node tests/course-category-metadata.test.examples.mjs
 */

import assert from 'node:assert/strict';
import { ApiError } from '../src/utils/apiError.js';
import {
  parseCreateCourseCategoryBody,
  parseUpdateCourseCategoryBody,
} from '../src/validators/courseCategory.schema.js';
import {
  COURSE_CATEGORY_BOARDS,
  COURSE_CATEGORY_CLASS_LEVELS,
  COURSE_CATEGORY_DEPARTMENTS,
} from '../src/constants/courseCategoryMetadata.constants.js';
import { test, summary } from './_testUtils.mjs';

console.log('course-category-metadata — enum validation');

test('defaults all three metadata fields to not_applicable when omitted', () => {
  const dto = parseCreateCourseCategoryBody({ name: 'MDCAT Prep' });
  assert.equal(dto.class_level, 'not_applicable');
  assert.equal(dto.department, 'not_applicable');
  assert.equal(dto.board, 'not_applicable');
});

test('accepts all three metadata fields when valid', () => {
  const dto = parseCreateCourseCategoryBody({
    name: '11th Pre-Medical',
    class_level: '11th',
    department: 'pre_medical',
    board: 'sindh_board',
  });
  assert.equal(dto.class_level, '11th');
  assert.equal(dto.department, 'pre_medical');
  assert.equal(dto.board, 'sindh_board');
});

test('rejects invalid class_level with 400', () => {
  assert.throws(
    () => parseCreateCourseCategoryBody({ name: 'Test', class_level: '13th' }),
    (err) => err instanceof ApiError && err.statusCode === 400 && err.details?.field === 'class_level'
  );
});

test('rejects invalid department with 400', () => {
  assert.throws(
    () => parseCreateCourseCategoryBody({ name: 'Test', department: 'law' }),
    (err) => err instanceof ApiError && err.statusCode === 400 && err.details?.field === 'department'
  );
});

test('rejects invalid board with 400', () => {
  assert.throws(
    () => parseCreateCourseCategoryBody({ name: 'Test', board: 'ib_board' }),
    (err) => err instanceof ApiError && err.statusCode === 400 && err.details?.field === 'board'
  );
});

test('update parser accepts metadata same as create', () => {
  const dto = parseUpdateCourseCategoryBody({
    name: 'Updated',
    class_level: 'a_level',
    department: 'ics',
    board: 'cambridge_a_level',
  });
  assert.equal(dto.class_level, 'a_level');
  assert.equal(dto.department, 'ics');
  assert.equal(dto.board, 'cambridge_a_level');
});

test('enum lists include regional boards and ics department', () => {
  assert.ok(COURSE_CATEGORY_DEPARTMENTS.includes('ics'));
  assert.ok(COURSE_CATEGORY_BOARDS.includes('kpk_board'));
  assert.ok(COURSE_CATEGORY_BOARDS.includes('balochistan_board'));
  assert.ok(COURSE_CATEGORY_BOARDS.includes('ajk_board'));
});

console.log('\ncourse-category-metadata — audit snapshot shape');

test('create snapshot includes metadata fields for activity log', () => {
  const dto = parseCreateCourseCategoryBody({
    name: 'Entry Test',
    class_level: 'entry_test',
    department: 'entry_test_prep',
    board: 'not_applicable',
  });
  const newSnapshot = {
    id: 1,
    name: dto.name,
    description: dto.description,
    class_level: dto.class_level,
    department: dto.department,
    board: dto.board,
    is_active: true,
    display_order: 0,
  };
  assert.deepEqual(newSnapshot.class_level, 'entry_test');
  assert.deepEqual(newSnapshot.department, 'entry_test_prep');
  assert.deepEqual(newSnapshot.board, 'not_applicable');
});

test('update diff captures metadata changes', () => {
  const oldSnapshot = {
    id: 2,
    name: 'Legacy',
    description: null,
    class_level: 'not_applicable',
    department: 'not_applicable',
    board: 'not_applicable',
    is_active: true,
    display_order: 1,
  };
  const dto = parseUpdateCourseCategoryBody({
    name: 'Legacy',
    class_level: '11th',
    department: 'pre_medical',
    board: 'federal_board',
  });
  const newSnapshot = {
    ...oldSnapshot,
    class_level: dto.class_level,
    department: dto.department,
    board: dto.board,
  };
  assert.notDeepEqual(oldSnapshot.class_level, newSnapshot.class_level);
  assert.equal(newSnapshot.class_level, '11th');
  assert.equal(newSnapshot.department, 'pre_medical');
  assert.equal(newSnapshot.board, 'federal_board');
});

console.log('\ncourse-category-metadata — frontend label helpers');

test('formatCategoryContextSubtext and enriched labels', async () => {
  const {
    formatCategoryContextSubtext,
    formatCategoryEnrichedLabel,
    categoryToFormMetadata,
  } = await import('../../client/src/course/courseCategoryMetadata.js');

  const category = {
    name: '11th Pre-Medical',
    classLevel: '11th',
    department: 'pre_medical',
    board: 'sindh_board',
  };
  assert.equal(formatCategoryContextSubtext(category), '11th Class · Pre-Medical · Sindh Board');
  assert.equal(
    formatCategoryEnrichedLabel(category),
    '11th Pre-Medical · 11th Class · Pre-Medical · Sindh Board'
  );
  assert.deepEqual(categoryToFormMetadata(category), {
    class_level: '11th',
    department: 'pre_medical',
    board: 'sindh_board',
  });
});

test('not_applicable fields produce empty context subtext (backward compatible)', async () => {
  const { formatCategoryContextSubtext, formatCategoryEnrichedLabel } = await import(
    '../../client/src/course/courseCategoryMetadata.js'
  );
  const legacy = { name: 'MDCAT', class_level: 'not_applicable', department: 'not_applicable', board: 'not_applicable' };
  assert.equal(formatCategoryContextSubtext(legacy), '');
  assert.equal(formatCategoryEnrichedLabel(legacy), 'MDCAT');
});

summary();
