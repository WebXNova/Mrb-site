import fs from 'fs';
import path from 'path';

const MIN_SEGMENT_LENGTH = 16;

function stripSegment(value) {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^\/+|\/+$/g, '');
}

function readAdminSecretPathFromServerEnvFile() {
  const envPath = path.resolve(process.cwd(), '../server/.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/^\s*ADMIN_SECRET_PATH\s*=\s*(\S+)/m);
    if (!match) return '';
    return stripSegment(match[1]);
  } catch {
    return '';
  }
}

function resolveAdminSecretPathSegment() {
  const fromProcess = stripSegment(process.env.ADMIN_SECRET_PATH);
  if (fromProcess) return fromProcess;

  const fromServerEnv = readAdminSecretPathFromServerEnvFile();
  if (fromServerEnv) return fromServerEnv;

  return '';
}

/**
 * Vite plugin: inject admin shell segment into index.html (not JS bundles).
 * Reads ADMIN_SECRET_PATH from process.env or ../server/.env.
 */
export function adminShellInjectionPlugin() {
  return {
    name: 'mrb-admin-shell-injection',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const segment = resolveAdminSecretPathSegment();
        if (!segment || segment.length < MIN_SEGMENT_LENGTH) {
          throw new Error(
            `ADMIN_SECRET_PATH is required (minimum ${MIN_SEGMENT_LENGTH} characters). ` +
              'Set it in server/.env or the shell environment before starting Vite.'
          );
        }

        const injection =
          `<script>window.__MRB_ADMIN_SHELL__=Object.freeze({s:${JSON.stringify(segment)}});</script>`;
        return html.replace('</head>', `    ${injection}\n  </head>`);
      },
    },
  };
}
