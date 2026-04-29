import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback = null) {
  const value = process.env[name] ?? fallback;
  if (value === null || value === undefined || value === '') {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mysql: {
    host: required('MYSQL_HOST', '127.0.0.1'),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: required('MYSQL_USER', 'root'),
    password: required('MYSQL_PASSWORD', ''),
    database: required('MYSQL_DATABASE', 'mrb_learning'),
  },

  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/mrb_learning'),
  redis: {
    url: process.env.REDIS_URL || '',
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'replace_access_secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'replace_refresh_secret'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
};
