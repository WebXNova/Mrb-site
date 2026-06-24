/**
 * Production log filter — suppresses non-essential console output in production.
 * Imported first in server.js so it takes effect before any other module code runs.
 */

if (process.env.NODE_ENV === 'production') {
  const _original = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    time: console.time,
    timeEnd: console.timeEnd,
  };

  const ALLOWED_PATTERNS = [
    /DB Connected/i,
    /Admin logged in/i,
    /pool configured/i,
  ];

  function isAllowed(...args) {
    const joined = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    return ALLOWED_PATTERNS.some(p => p.test(joined));
  }

  console.log = function (...args) {
    if (isAllowed(...args)) {
      _original.log.apply(console, args);
    }
  };

  console.info = function () {};
  console.debug = function () {};
  console.time = function () {};
  console.timeEnd = function () {};
}
