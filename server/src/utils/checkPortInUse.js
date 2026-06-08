import net from 'net';

/**
 * Returns true when something is already bound to `port` (EADDRINUSE risk).
 */
export function checkPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.close(() => resolve(false));
      })
      .listen(port);
  });
}
