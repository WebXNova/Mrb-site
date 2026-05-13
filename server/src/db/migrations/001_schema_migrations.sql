-- Migration ledger (immutable once applied). Runner also ensures this table exists before the first file.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(191) NOT NULL PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
