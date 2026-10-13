import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbFile = process.env.DATABASE_FILE || './data/rideshare-genesis.sqlite';
const resolvedPath = path.isAbsolute(dbFile)
  ? dbFile
  : path.resolve(process.cwd(), dbFile);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

export const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const schemaDir = path.resolve(__dirname, '../../../database/migrations');
// Co-locates driver-verification document storage with wherever this
// process's DB file actually lives — the real data dir in production, a
// throwaway os.tmpdir() path in tests — so nothing extra needs wiring up
// per-environment (see driverVerification/docStorage.js).
export const dataDir = path.dirname(resolvedPath);
