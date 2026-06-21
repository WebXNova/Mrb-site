import fs from 'fs';
import path from 'path';
import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { adminShellInjectionPlugin } from './vite-plugins/adminShellInjection.js';

const API_PROXY_RETRY = {
  maxAttempts: 8,
  delayMs: 1500,
};

const BACKEND_OFFLINE_LOG_THROTTLE_MS = 15_000;

/**
 * Dev-only: `/api` must hit the same port the Express server uses (`PORT` in `../server/.env`, default 3000).
 * A mismatch returns 502/503 from the Vite proxy with no logs on the API — easy to confuse with a backend bug.
 */
function resolveApiDevProxyTarget() {
  const fromShell = String(process.env.VITE_API_PROXY_TARGET || '').trim();
  if (fromShell) return fromShell.replace(/\/$/, '');
  const fallbackPort = 3000;
  const envPath = path.resolve(process.cwd(), '../server/.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/^\s*PORT\s*=\s*(\S+)/m);
    if (match) {
      const n = Number(match[1].trim().replace(/^["']|["']$/g, ''));
      if (Number.isFinite(n) && n > 0 && n <= 65535) {
        return `http://127.0.0.1:${n}`;
      }
    }
  } catch {
    // Missing or unreadable server/.env — use default API port.
  }
  return `http://127.0.0.1:${fallbackPort}`;
}

function isConnRefused(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.code === 'ECONNREFUSED') return true;
  if (Array.isArray(err.errors)) {
    return err.errors.some((sub) => sub && typeof sub === 'object' && sub.code === 'ECONNREFUSED');
  }
  return typeof err.message === 'string' && err.message.includes('ECONNREFUSED');
}

function sendBackendOfflineResponse(res, target) {
  if (!res || res.headersSent || res.writableEnded) return;
  res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify({
      success: false,
      error: {
        code: 'BACKEND_OFFLINE',
        message: `Backend offline (${target}). Start the API server and retry.`,
      },
    })
  );
}

function createApiProxyOptions(target) {
  const logState = { lastAt: 0 };

  return {
    target,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('error', (err, req, res) => {
        if (!isConnRefused(err)) return;

        const attempt = Number(req.__mrbProxyRetryAttempt || 0);
        if (attempt < API_PROXY_RETRY.maxAttempts && res && !res.headersSent && !res.writableEnded) {
          req.__mrbProxyRetryAttempt = attempt + 1;
          const now = Date.now();
          if (now - logState.lastAt >= BACKEND_OFFLINE_LOG_THROTTLE_MS) {
            logState.lastAt = now;
            console.warn(
              `[vite] API backend offline (${target}). Retrying (${attempt + 1}/${API_PROXY_RETRY.maxAttempts})…`
            );
          }
          setTimeout(() => {
            if (res.writableEnded || res.headersSent) return;
            proxy.web(req, res, { target, changeOrigin: true });
          }, API_PROXY_RETRY.delayMs);
          return;
        }

        sendBackendOfflineResponse(res, target);
      });
    },
  };
}

function createDevLogger() {
  const logger = createLogger();
  const baseError = logger.error.bind(logger);
  const baseWarn = logger.warn.bind(logger);

  logger.error = (msg, options) => {
    if (typeof msg === 'string' && shouldSuppressProxyNoise(msg)) return;
    baseError(msg, options);
  };

  logger.warn = (msg, options) => {
    if (typeof msg === 'string' && shouldSuppressProxyNoise(msg)) return;
    baseWarn(msg, options);
  };

  return logger;
}

function shouldSuppressProxyNoise(message) {
  return /ECONNREFUSED|http proxy error|connect ECONNREFUSED|AggregateError.*ECONNREFUSED/i.test(message);
}

/** Dev-only browser overlay when `/api` proxy returns 502/503 (backend down). */
function backendOfflineOverlayPlugin() {
  return {
    name: 'mrb-backend-offline-overlay',
    apply: 'serve',
    transformIndexHtml: {
      order: 'post',
      handler() {
        return [
          {
            tag: 'style',
            injectTo: 'head',
            children: `
              #mrb-backend-offline-overlay {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 1.5rem;
                background: rgba(15, 23, 42, 0.72);
                backdrop-filter: blur(4px);
              }
              #mrb-backend-offline-overlay[data-visible='true'] { display: flex; }
              #mrb-backend-offline-overlay .mrb-backend-offline-card {
                max-width: 28rem;
                width: 100%;
                border-radius: 12px;
                padding: 1.25rem 1.5rem;
                background: #0f172a;
                color: #e2e8f0;
                box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
                border: 1px solid rgba(148, 163, 184, 0.25);
                font-family: system-ui, -apple-system, Segoe UI, sans-serif;
              }
              #mrb-backend-offline-overlay h2 {
                margin: 0 0 0.5rem;
                font-size: 1.125rem;
              }
              #mrb-backend-offline-overlay p {
                margin: 0;
                line-height: 1.5;
                color: #94a3b8;
                font-size: 0.95rem;
              }
            `,
          },
          {
            tag: 'script',
            injectTo: 'body',
            children: `
              (function () {
                if (window.__MRB_BACKEND_OVERLAY__) return;
                window.__MRB_BACKEND_OVERLAY__ = true;

                var overlay = document.createElement('div');
                overlay.id = 'mrb-backend-offline-overlay';
                overlay.setAttribute('aria-live', 'polite');
                overlay.innerHTML =
                  '<div class="mrb-backend-offline-card" role="alert">' +
                  '<h2>Backend offline</h2>' +
                  '<p>The API server is not reachable. Start <code>npm run dev</code> in <code>server/</code>, then reload this page.</p>' +
                  '</div>';
                document.addEventListener('DOMContentLoaded', function () {
                  document.body.appendChild(overlay);
                });

                function showOverlay() {
                  overlay.setAttribute('data-visible', 'true');
                }
                function hideOverlay() {
                  overlay.setAttribute('data-visible', 'false');
                }

                function isApiRequest(input) {
                  try {
                    var url = typeof input === 'string' ? input : (input && input.url) || '';
                    return url.indexOf('/api') !== -1;
                  } catch (_) {
                    return false;
                  }
                }

                var nativeFetch = window.fetch.bind(window);
                window.fetch = function (input, init) {
                  return nativeFetch(input, init).then(function (response) {
                    if (isApiRequest(input) && (response.status === 502 || response.status === 503)) {
                      showOverlay();
                    } else if (isApiRequest(input) && response.ok) {
                      hideOverlay();
                    }
                    return response;
                  }, function (error) {
                    if (isApiRequest(input)) showOverlay();
                    throw error;
                  });
                };
              })();
            `,
          },
        ];
      },
    },
  };
}

const apiProxyTarget = resolveApiDevProxyTarget();

export default defineConfig(({ mode }) => ({
  customLogger: mode === 'development' ? createDevLogger() : undefined,
  plugins: [
    react(),
    adminShellInjectionPlugin(),
    ...(mode === 'development' ? [backendOfflineOverlayPlugin()] : []),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@mui/') || id.includes('@emotion/')) return 'mui';
          if (id.includes('ckeditor') || id.includes('@ckeditor')) return 'ckeditor';
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'charts';
          if (id.includes('react-router')) return 'router';
          if (id.includes('react-dom') || id.includes('react/')) return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@course-wizard-schema': path.resolve(process.cwd(), '../server/src/validators/courseWizard.schema.js'),
      '@': path.resolve(process.cwd(), './src'),
      '@components': path.resolve(process.cwd(), './src/components'),
      '@pages': path.resolve(process.cwd(), './src/pages'),
      '@styles': path.resolve(process.cwd(), './src/styles'),
      '@data': path.resolve(process.cwd(), './src/data'),
      '@assets': path.resolve(process.cwd(), './src/assets'),
    },
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      allow: [path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '../server')],
    },
    proxy: {
      '/api': createApiProxyOptions(apiProxyTarget),
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api': createApiProxyOptions(apiProxyTarget),
    },
  },
}));
