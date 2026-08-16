/**
 * Idempotent bootstrap recovery — aligns live DB with create-admin.js intent.
 *
 * When no super_admin exists but at least one active admin does, promote the
 * oldest active admin (lowest id). Matches scripts/create-admin.js which sets
 * role = 'super_admin' on bootstrap upsert; legacy rows may still be 'admin'.
 *
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function ensureSuperAdminBootstrap(mysqlPool) {
  const [[counts]] = await mysqlPool.query(
    `SELECT
       SUM(role = 'super_admin' AND status = 'active') AS super_count,
       SUM(role = 'admin' AND status = 'active') AS admin_count
     FROM users`
  );

  const superCount = Number(counts?.super_count ?? 0);
  const adminCount = Number(counts?.admin_count ?? 0);

  if (superCount > 0 || adminCount === 0) {
    return { skipped: true, reason: superCount > 0 ? 'super_admin_exists' : 'no_active_admin' };
  }

  const [result] = await mysqlPool.query(
    `UPDATE users
     SET role = 'super_admin'
     WHERE role = 'admin' AND status = 'active'
     ORDER BY id ASC
     LIMIT 1`
  );

  return {
    promoted: Number(result?.affectedRows ?? 0) > 0,
    affectedRows: Number(result?.affectedRows ?? 0),
  };
}
