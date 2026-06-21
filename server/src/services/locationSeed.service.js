import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../sql/schema.sql');

function extractInsertBlock(schemaSql, tableName) {
  const pattern = new RegExp(`INSERT INTO ${tableName}[\\s\\S]*?;`, 'i');
  const match = schemaSql.match(pattern);
  if (!match) {
    throw new Error(`Could not find seed block for ${tableName}`);
  }
  return match[0].replace(/^INSERT INTO\s+/i, 'INSERT IGNORE INTO ');
}

/**
 * The main seed lists only selected cities per district; many districts have no rows yet.
 * Without at least one city, the enrollment cascading UI cannot satisfy city_id FK.
 * Idempotent: only inserts where an active district has zero active cities.
 */
async function ensureFallbackCityPerBareDistrict(pool) {
  await pool.query(`
    INSERT IGNORE INTO cities (province_id, district_id, name, slug, is_other_option, is_active, sort_order)
    SELECT
      d.province_id,
      d.id,
      CONCAT(d.name, ' (Other)'),
      CONCAT(d.slug, '-city-fallback'),
      TRUE,
      TRUE,
      9999
    FROM districts d
    WHERE d.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM cities c WHERE c.district_id = d.id AND c.is_active = TRUE
      )
  `);
}

export async function seedLocationTables(pool) {
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const statements = ['provinces', 'districts', 'cities'].map((table) => extractInsertBlock(schemaSql, table));

  for (const statement of statements) {
    await pool.query(statement);
  }
  await ensureFallbackCityPerBareDistrict(pool);
}
