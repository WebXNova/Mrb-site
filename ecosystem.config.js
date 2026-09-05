/**
 * PM2 production process manager — MRB Learning Platform API
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production --update-env
 *   pm2 save && pm2 startup systemd -u deploy --hp /home/deploy
 *
 * Frontend is served by Nginx from client/dist (not managed by PM2).
 *
 * Cluster (instances: 2): JWT/sessions/exams/rate-limits are MySQL+Redis backed.
 * Background jobs (email worker, cleanup schedulers) run only on NODE_APP_INSTANCE=0
 * (see server/src/utils/pm2InstanceRole.js) so they are not duplicated.
 *
 * Readiness: server.js calls process.send('ready') only after HTTP listen().
 * wait_ready + listen_timeout prevent PM2 from treating a still-migrating
 * process as healthy. Use `pm2 reload` (not restart) for near-zero-downtime.
 *
 * Pool sizing: each worker uses MYSQL_POOL_CONNECTION_LIMIT (default 15 here)
 * so two workers stay near the previous single-process budget of ~30.
 */

const path = require('path');

const rootDir = __dirname;
const serverDir = path.join(rootDir, 'server');
const logDir = path.join(rootDir, 'logs', 'pm2');

module.exports = {
  apps: [
    {
      name: 'mrb-api',
      cwd: serverDir,
      script: 'src/server.js',
      interpreter: 'node',
      /** Cluster shares one port; do NOT use fork×2 on the same PORT. */
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      /** Allow recovery from transient dependency outages without permanent errored state. */
      max_restarts: 40,
      /** Schema + Redis connect often exceed 10s; require sustained health before reset counter. */
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 2000,
      /**
       * Per-worker cap. Admin ExcelJS/Sharp spikes that OOM one worker leave the
       * sibling worker available for student traffic during `pm2 reload`.
       */
      max_memory_restart: '768M',
      kill_timeout: 15000,
      /** Must cover STARTUP_DEADLINE_MS (default 180s) with buffer. */
      listen_timeout: 200000,
      wait_ready: true,
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: path.join(logDir, 'mrb-api-out.log'),
      error_file: path.join(logDir, 'mrb-api-error.log'),
      env_file: path.join(serverDir, '.env'),
      env_production: {
        NODE_ENV: 'production',
        PORT: '4000',
        /** Bind loopback only — Nginx reverse-proxies /api */
        LISTEN_HOST: '127.0.0.1',
        /** 15 × 2 workers ≈ prior single-process default of 30 */
        MYSQL_POOL_CONNECTION_LIMIT: '15',
      },
    },
  ],
};
