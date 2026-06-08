/**
 * Registered from `server.js` as the first import so uncaught errors surface in logs
 * before nodemon exits (especially useful after async webhook work).
 */

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});
