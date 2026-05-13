# SQL migrations

## Layout

- **`src/sql/schema.sql`** — reference DDL only: `CREATE TABLE IF NOT EXISTS` (no `PREPARE` / `EXECUTE` or one-off `UPDATE` blocks). Applied on API startup unless `SKIP_SCHEMA_SYNC=true`.
- **`src/db/migrations/*.sql`** — ordered, immutable migration files. Filename is the version key (lexicographic order). Each file runs in a single transaction with `multipleStatements` enabled (the app MySQL pool enables this for trusted migration batches only).
- **`schema_migrations`** — ledger table (`version`, `checksum`, `applied_at`). Checksums detect accidental edits to already-applied files.

## Commands

- **`npm run db:migrate`** — apply pending migrations using the same MySQL env as the API (`MYSQL_*` / `DATABASE_URL` per `config/env.js`), then exit.
- On **`npm start`** / **`node src/server.js`**, pending migrations run automatically after reference schema sync, unless `SKIP_DB_MIGRATE_ON_START=true`.

## CI / production

1. Ensure MySQL is reachable and credentials match `.env` (or platform secrets).
2. Run `npm run db:migrate` before or alongside the first `node src/server.js` in a release. The server also applies pending migrations on boot, so a dedicated migrate step is optional but recommended for visibility and fail-fast deploys.

## Adding a new change

1. Append a new file with the next sort order, e.g. `003_add_foo_index.sql`.
2. Prefer additive, idempotent SQL where practical (`IF NOT EXISTS`, guarded `INFORMATION_SCHEMA` checks).
3. **Never** edit a migration file that has already been applied in any environment; add a follow-up file instead.

## Baseline choice

Existing environments historically ran dynamic DDL from a single `schema.sql`. That logic was extracted once into **`002_legacy_incremental.sql`** so new installs get the same end state via one recorded migration. New drift should use **`003+`** files only.
