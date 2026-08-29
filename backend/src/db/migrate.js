import fs from 'node:fs';
import path from 'node:path';
import { db, schemaDir } from './connection.js';

const MIGRATIONS = ['0001_init.sql', '0002_environmental_impact.sql', '0003_commission.sql'];

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
  );

  for (const name of MIGRATIONS) {
    if (applied.has(name)) continue;
    const filePath = path.join(schemaDir, name);
    const sql = fs.readFileSync(filePath, 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    console.log(`[migrate] applied ${name}`);
  }
}
