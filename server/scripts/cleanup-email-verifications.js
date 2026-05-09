import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';

const retentionHours = Math.max(1, Number(process.env.EMAIL_VERIFICATION_RETENTION_HOURS || 72));

async function main() {
  const [result] = await mysqlPool.query(
    `DELETE FROM email_verifications
     WHERE expires_at < (NOW() - INTERVAL ? HOUR)
        OR (used_at IS NOT NULL AND used_at < (NOW() - INTERVAL ? HOUR))`,
    [retentionHours, retentionHours]
  );
  const affected = result?.affectedRows ?? 0;
  console.log(`cleanup-email-verifications: deleted ${affected} row(s), retention ${retentionHours}h.`);
  await mysqlPool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

