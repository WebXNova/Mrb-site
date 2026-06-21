/**
 * PM2 production process manager — MRB Learning Platform API
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production --update-env
 *   pm2 save && pm2 startup systemd -u deploy --hp /home/deploy
 *
 * Frontend is served by Nginx from client/dist (not managed by PM2).
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
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 15,
      min_uptime: '10s',
      restart_delay: 3000,
      max_memory_restart: '768M',
      kill_timeout: 15000,
      listen_timeout: 60000,
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: path.join(logDir, 'mrb-api-out.log'),
      error_file: path.join(logDir, 'mrb-api-error.log'),
      env_file: path.join(serverDir, '.env'),
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        /** Bind loopback only — Nginx reverse-proxies /api */
        LISTEN_HOST: '127.0.0.1',
      },
    },
  ],
};
