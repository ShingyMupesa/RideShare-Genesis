import { Hono } from 'hono';
import { newId } from '../lib/ids.js';
import { optionalAuth } from '../lib/auth.js';
import { requireAdmin } from '../lib/adminAuth.js';
import { BadRequest } from '../lib/errors.js';
import { feedbackLimiter } from '../lib/rateLimit.js';

export const feedback = new Hono();

// Self-provisions the same way tracking.js does for page_events — no
// separate migration step needed against the existing production table.
let tableEnsured = false;
async function ensureTable(db) {
  if (tableEnsured) return;
  await db.exec(
    `CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, message TEXT NOT NULL, email TEXT, page TEXT, user_id TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  tableEnsured = true;
}

// Public and unauthenticated by design — campaign traffic (a pitch reader,
// someone who just installed the PWA) needs to be able to leave feedback
// before ever creating an account. optionalAuth attaches user_id when a
// valid token happens to be present, but never requires one.
feedback.post('/', feedbackLimiter, optionalAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const message = (body.message || '').trim();
  if (!message) throw BadRequest('message is required');
  if (message.length > 4000) throw BadRequest('message is too long (max 4000 characters)');

  await ensureTable(db);
  const authUser = c.get('user');
  await db
    .prepare(`INSERT INTO feedback (id, message, email, page, user_id) VALUES (?, ?, ?, ?, ?)`)
    .bind(
      newId('fbk'),
      message,
      body.email ? String(body.email).trim().slice(0, 200) : null,
      body.page ? String(body.page).slice(0, 200) : null,
      authUser?.id || null
    )
    .run();

  return c.json({ ok: true }, 201);
});

feedback.use('/list', requireAdmin);
feedback.get('/list', async (c) => {
  const db = c.env.DB;
  await ensureTable(db);
  const { results } = await db.prepare(`SELECT * FROM feedback ORDER BY created_at DESC LIMIT 200`).all();
  return c.json({ feedback: results });
});
