import { execSync } from 'child_process';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findListeningPidsWindows(port) {
  let output = '';
  try {
    output = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return [];
  }

  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const match = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
    if (!match) continue;
    if (Number(match[1]) !== Number(port)) continue;
    const pid = Number(match[2]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

function findListeningPidsUnix(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function findListeningPids(port) {
  if (process.platform === 'win32') return findListeningPidsWindows(port);
  return findListeningPidsUnix(port);
}

function terminatePid(pid) {
  if (pid === process.pid) return false;

  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Dev-only: stop stale listeners so nodemon / a fresh `npm run dev` can bind the port.
 * Never call in production.
 */
export async function releaseDevPortListeners(port) {
  const pids = findListeningPids(port).filter((pid) => pid !== process.pid);
  if (!pids.length) return false;

  let stopped = false;
  for (const pid of pids) {
    if (terminatePid(pid)) {
      console.warn(`[dev] Stopped stale process on port ${port} (PID ${pid})`);
      stopped = true;
    }
  }

  if (stopped) {
    await sleep(400);
  }
  return stopped;
}
