/**
 * G-07 — publish busy state + UI wiring tests.
 *
 * Run: npm run test:publish-busy-ui
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isAnyPublishBusy,
  isTestPublishBusy,
  publishBusyKey,
  publishMenuLabel,
} from './testPublishBusyState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(__dirname, '..', '..', '..');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(clientRoot, fileRel);
  assert(existsSync(filePath), `file exists: ${fileRel}`);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    assert(text.includes(needle), `${label}: "${needle}"`);
  }
}

console.log('testPublishBusyState — G-07\n');

assert(publishBusyKey(42) === 'publish-42', 'publishBusyKey format');
assert(isTestPublishBusy('publish-7', 7), 'detects busy test');
assert(!isTestPublishBusy('publish-7', 8), 'other test not busy');
assert(isAnyPublishBusy('publish-3'), 'detects any publish in flight');
assert(!isAnyPublishBusy('delete'), 'delete action is not publish busy');
assert(!isAnyPublishBusy(''), 'empty busy action');

assert(publishMenuLabel('publish-5', 5) === 'Publishing…', 'active row shows Publishing…');
assert(publishMenuLabel('publish-5', 9) === 'Publish', 'other row keeps Publish label');
assert(publishMenuLabel('', 5) === 'Publish', 'idle shows Publish');

mustContain(
  'src/admin/pages/AdminTestsPage.jsx',
  ['publishInFlightRef', 'publishBusyKey', 'isAnyPublishBusy'],
  'AdminTestsPage guards duplicate publish'
);

mustContain(
  'src/admin/components/TestRowActionsMenu.jsx',
  ['disabled={publishing}', 'publishMenuLabel', 'aria-busy={publishingThisTest'],
  'TestRowActionsMenu disables publish while busy'
);

mustContain(
  'src/admin/components/AdminTestMobileCard.jsx',
  ['busyAction={busyAction}', 'busyAction = \'\''],
  'mobile card forwards busyAction'
);

mustContain(
  'src/admin/pages/AdminTestsPage.jsx',
  ['busyAction={busyAction}'],
  'AdminTestsPage passes busyAction to mobile cards'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
