import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export async function buildTestApp() {
  const tmpFile = path.join(os.tmpdir(), `rsg-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  process.env.DATABASE_FILE = tmpFile;
  process.env.JWT_SECRET = 'test-secret';
  process.env.CLIENT_ORIGIN = '*';

  const { runMigrations } = await import('../../src/db/migrate.js');
  runMigrations();
  const { createApp } = await import('../../src/app.js');
  const app = createApp();

  return { app, cleanup: () => fs.rmSync(tmpFile, { force: true }) };
}
