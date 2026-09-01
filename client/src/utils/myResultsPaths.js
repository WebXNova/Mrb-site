export const MY_RESULTS_PATH = '/tests/my-results';
export const MY_TESTS_LEGACY_PATH = '/tests/my-tests';

export function isMyResultsPath(pathname) {
  const path = String(pathname || '');
  return path === MY_RESULTS_PATH || path.startsWith(`${MY_RESULTS_PATH}/`)
    || path === MY_TESTS_LEGACY_PATH || path.startsWith(`${MY_TESTS_LEGACY_PATH}/`);
}
