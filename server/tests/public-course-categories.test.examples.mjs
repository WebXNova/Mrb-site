/**
 * Public course category catalog — query parsing + filter state.
 *
 * Run: node tests/public-course-categories.test.examples.mjs
 */

import assert from 'node:assert/strict';
import {
  parsePublicCatalogCategoryId,
  parsePublicCatalogCategoryIds,
} from '../src/validators/publicCatalogCategory.schema.js';
import { test, summary } from './_testUtils.mjs';

console.log('public-course-categories — query parsing');

test('parsePublicCatalogCategoryId returns null when absent', () => {
  assert.equal(parsePublicCatalogCategoryId({}), null);
  assert.equal(parsePublicCatalogCategoryId({ category_id: '' }), null);
});

test('parsePublicCatalogCategoryId parses positive integer', () => {
  assert.equal(parsePublicCatalogCategoryId({ category_id: '12' }), 12);
  assert.equal(parsePublicCatalogCategoryId({ category_id: ['7'] }), 7);
});

test('parsePublicCatalogCategoryId rejects invalid values', () => {
  assert.throws(() => parsePublicCatalogCategoryId({ category_id: '0' }));
  assert.throws(() => parsePublicCatalogCategoryId({ category_id: 'abc' }));
});

test('parsePublicCatalogCategoryIds parses comma list', () => {
  assert.deepEqual(parsePublicCatalogCategoryIds({ category_ids: '1,2,3' }), [1, 2, 3]);
  assert.deepEqual(parsePublicCatalogCategoryIds({}), []);
});

console.log('\npublic-course-categories — frontend filter state');

test('buildCatalogCategoryFilterState single-select shape', async () => {
  const { buildCatalogCategoryFilterState, readCategoryIdFromSearchParams, writeCategorySearchParams } =
    await import('../../client/src/course/publicCatalogQueries.js');

  assert.deepEqual(buildCatalogCategoryFilterState(null), {
    mode: 'single',
    categoryId: null,
    categoryIds: [],
  });
  assert.deepEqual(buildCatalogCategoryFilterState(5), {
    mode: 'single',
    categoryId: 5,
    categoryIds: [5],
  });
  assert.equal(readCategoryIdFromSearchParams('?category=9'), 9);
  assert.deepEqual(writeCategorySearchParams(4), { category: '4' });
  assert.deepEqual(writeCategorySearchParams(null), {});
});

summary();
