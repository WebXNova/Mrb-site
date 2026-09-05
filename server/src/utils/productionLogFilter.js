/**
 * Production log filter — keeps operational reliability events visible.
 * Never throws (JSON.stringify of circular values must not crash the process).
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
    /\[startup\]/,
    /\[shutdown\]/,
    /\[redis/,
    /\[mysql/,
    /\[email/,
    /\[http\.error/,
    /\[process\.fatal/,
    /\[cleanup-schedulers\]/,
    /\[safepay\]/,
    /\[cee\./,
    /MRB API listening/,
    /UNCAUGHT/,
    /UNHANDLED/,
    /Failed to start server/,
  ];

  function safeJoin(args) {
    try {
      return args
        .map((a) => {
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return '[unserializable]';
          }
        })
        .join(' ');
    } catch {
      return '';
    }
  }

  function isAllowed(...args) {
    const joined = safeJoin(args);
    return ALLOWED_PATTERNS.some((p) => p.test(joined));
  }

  console.log = function (...args) {
    if (isAllowed(...args)) {
      _original.log.apply(console, args);
    }
  };

  console.info = function (...args) {
    if (isAllowed(...args)) {
      _original.info.apply(console, args);
    }
  };

  console.debug = function () {};
  console.time = function () {};
  console.timeEnd = function () {};
}
