import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
});

function required(name, fallback = null) {
  const value = process.env[name] ?? fallback;
  if (value === null || value === undefined || value === '') {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

function requiredJwtSecret(name) {
  const value = required(name);
  const lowered = String(value).toLowerCase();
  if (String(value).length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  if (
    lowered.includes('replace') ||
    lowered.includes('secret') ||
    lowered.includes('changeme') ||
    lowered.includes('example')
  ) {
    throw new Error(`${name} appears weak or placeholder-like. Use a strong random secret.`);
  }
  return value;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mysql: {
    host: required('MYSQL_HOST', '127.0.0.1'),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: required('MYSQL_USER'),
    password: required('MYSQL_PASSWORD'),
    database: required('MYSQL_DATABASE'),
  },
  redis: {
    url: process.env.REDIS_URL || '',
  },

  jwt: {
    accessSecret: requiredJwtSecret('JWT_ACCESS_SECRET'),
    refreshSecret: requiredJwtSecret('JWT_REFRESH_SECRET'),
    issuer: process.env.JWT_ISSUER || 'mrb-learning',
    audience: process.env.JWT_AUDIENCE || 'mrb-learning-clients',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  security: {
    requireRedisInProduction: parseBoolean(process.env.REQUIRE_REDIS_IN_PRODUCTION, true),
    allowLegacyTokenVersion: parseBoolean(process.env.ALLOW_LEGACY_TOKEN_VERSION, true),
  },
};

if (env.nodeEnv === 'production') {
  if (env.security.requireRedisInProduction && !env.redis.url) {
    throw new Error('REDIS_URL is required in production when REQUIRE_REDIS_IN_PRODUCTION is enabled');
  }
  if (env.jwt.issuer === 'mrb-learning' || env.jwt.audience === 'mrb-learning-clients') {
    throw new Error('JWT_ISSUER and JWT_AUDIENCE must be explicitly overridden in production');
  }
}
