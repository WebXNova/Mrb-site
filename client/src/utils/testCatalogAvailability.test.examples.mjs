/**
 * Public catalog availability labels.
 * Run: node src/utils/testCatalogAvailability.test.examples.mjs
 */
import { catalogAvailability, resolveCatalogCardAction } from './testCatalogAvailability.js';

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

console.log('testCatalogAvailability\n');

assert(catalogAvailability({ seatsFull: true }).label === 'Full', 'full seats show Full');
assert(catalogAvailability({ seatsFull: true }).canAct === false, 'full seats are not actionable');
assert(catalogAvailability({ examOpen: true }, { kind: 'free' }).label === 'Open', 'open free tests');
assert(
  catalogAvailability({ examOpen: true }, { kind: 'paid' }).label === 'Open',
  'open paid tests'
);
assert(
  catalogAvailability({ examOpen: false, startDate: '2099-01-01T00:00:00.000Z' }).label === 'Closed',
  'closed + future start is Closed, not hidden'
);
assert(
  catalogAvailability({ examOpen: true, startDate: '2099-01-01T00:00:00.000Z' }).label === 'Upcoming',
  'open + future start is Upcoming'
);
assert(
  catalogAvailability({ examOpen: true, endDate: '2020-01-01T00:00:00.000Z' }).label === 'Expired',
  'open + past end is Expired'
);
assert(
  catalogAvailability({ examOpen: false, endDate: '2020-01-01T00:00:00.000Z' }).label === 'Expired',
  'closed + past end is Expired'
);
assert(
  catalogAvailability({ listingStatus: 'live' }, { kind: 'free' }).label === 'Open',
  'server listingStatus live wins'
);
assert(
  catalogAvailability({ listingStatus: 'closed', examOpen: true }).label === 'Closed',
  'server listingStatus closed wins over examOpen'
);

{
  const availability = catalogAvailability({ examOpen: true }, { kind: 'free' });
  const exhausted = resolveCatalogCardAction(
    {
      slug: 'bio',
      student: {
        action: 'view_details',
        ctaLabel: 'View Details',
        availabilityLabel: 'Completed',
        availabilityTone: 'completed',
        attemptId: 9,
      },
    },
    availability,
    { kind: 'free' }
  );
  assert(exhausted.ctaLabel === 'View Details', 'completed free test CTA is View Details');
  assert(exhausted.ctaLabel !== 'Start Test', 'completed free test is not a new Start Test');
  assert(String(exhausted.to).includes('/result'), 'completed CTA opens the saved result');
}

{
  const availability = catalogAvailability({ examOpen: true }, { kind: 'paid' });
  const exhausted = resolveCatalogCardAction(
    {
      slug: 'chem',
      student: {
        action: 'view_details',
        ctaLabel: 'View Details',
        attemptId: 12,
      },
    },
    availability,
    { kind: 'paid' }
  );
  assert(exhausted.ctaLabel !== 'Register for Test', 'completed paid test is not a fresh registration');
}

{
  const availability = catalogAvailability({ examOpen: true }, { kind: 'paid' });
  const otherStudent = resolveCatalogCardAction({ slug: 'chem' }, availability, { kind: 'paid' });
  assert(otherStudent.ctaLabel === 'Register for Test', 'another student still sees Register for Test');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
