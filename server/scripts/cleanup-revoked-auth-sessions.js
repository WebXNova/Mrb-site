import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';

const retentionDays = Math.max(1, Number(process.env.AUTH_SESSION_RETENTION_DAYS || 30));

async function main() {
  const [result] = await mysqlPool.query(
    `DELETE FROM auth_sessions
     WHERE expires_at < NOW()
        OR (revoked_at IS NOT NULL AND revoked_at < (NOW() - INTERVAL ? DAY))`,
    [retentionDays]
  );
  const affected = result?.affectedRows ?? 0;
  console.log(
    `cleanup-revoked-auth-sessions: deleted ${affected} row(s) (expired or revoked older than ${retentionDays} day(s)).`
  );
  await mysqlPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
