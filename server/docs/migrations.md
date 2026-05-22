# Database schema

The only source of truth for the relational schema is:

`server/src/sql/schema.sql`

Apply it manually in **MySQL Workbench** (or `mysql` CLI) when you create or refresh a database.

This project does **not** use incremental migration files. After you change `schema.sql`, apply the relevant statements to existing databases yourself (e.g. `ALTER TABLE` in Workbench).

The API can optionally run the full script once on an **empty** database when the `provinces` table does not exist and `SKIP_SCHEMA_SYNC` is not set (`server.js`).

On startup, the server also runs small idempotent checks (see `server/src/db/`) — for example `ensureCourseCatalogSchema` adds `courses.short_description` and the `course_pricing` table when they are missing, so `/api/courses/public` keeps working without a full manual re-import.
