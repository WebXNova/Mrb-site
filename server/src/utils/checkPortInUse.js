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

/**
 * Dev/nodemon restarts can start a new process before the old one releases the port.
 * Wait briefly instead of exiting immediately.
 */
export async function waitForPortAvailable(port, { maxAttempts = 20, delayMs = 500 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (!(await checkPortInUse(port))) return true;
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}
