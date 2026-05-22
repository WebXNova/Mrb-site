/**
 * Registered from `server.js` as the first import so uncaught errors surface in logs
 * before nodemon exits (especially useful after async webhook work).
 */

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:');
  console.error(err);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:');
  console.error(reason);
});
