/**
 * Enrollment batch options (must stay in sync with server `ENROLLMENT_BATCH_IDS`).
 * Add entries here when opening new batches.
 */
export const ENROLLMENT_BATCH_OPTIONS = [
  { value: '1', label: 'Batch 1' },
  { value: '2', label: 'Batch 2' },
  { value: '3', label: 'Batch 3' },
  { value: '4', label: 'Batch 4' },
  { value: '5', label: 'Batch 5' },
];

export function batchLabel(batchNumber) {
  if (!batchNumber) return '';
  const found = ENROLLMENT_BATCH_OPTIONS.find((o) => o.value === String(batchNumber));
  return found ? found.label : `Batch ${batchNumber}`;
}
