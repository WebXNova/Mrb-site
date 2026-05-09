import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';

const retentionHours = Number(process.env.UNVERIFIED_USER_RETENTION_HOURS || 72);
const hardLimit = Number(process.env.UNVERIFIED_USER_CLEANUP_LIMIT || 500);

async function cleanup() {
  const [result] = await mysqlPool.query(
    `DELETE FROM users
     WHERE role = 'student'
       AND is_verified = FALSE
       AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
     ORDER BY created_at ASC
     LIMIT ?`,
    [retentionHours, hardLimit]
  );
  console.log(
    JSON.stringify({
      deletedUsers: result.affectedRows || 0,
      retentionHours,
      hardLimit,
    })
  );
}

cleanup()
  .catch((error) => {
    console.error('cleanup stale unverified users failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mysqlPool.end();
  });

