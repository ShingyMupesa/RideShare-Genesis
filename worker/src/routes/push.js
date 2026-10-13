import { Hono } from 'hono';
import { newId } from '../lib/ids.js';
import { requireAuth } from '../lib/auth.js';
import { BadRequest } from '../lib/errors.js';
import { ensurePushTable } from '../lib/notify.js';

export const push = new Hono();

push.get('/vapid-public-key', (c) => {
  const publicKey = c.env.VAPID_PUBLIC_KEY || null;
  return c.json({ publicKey, enabled: !!publicKey });
});

push.post('/subscribe', requireAuth, async (c) => {
  const db = c.env.DB;
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw BadRequest('endpoint and keys.p256dh/keys.auth are required');

  await ensurePushTable(db);
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
    )
    .bind(newId('push'), authUser.id, endpoint, keys.p256dh, keys.auth)
    .run();

  return c.json({ ok: true }, 201);
});

push.post('/unsubscribe', requireAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { endpoint } = body;
  if (!endpoint) throw BadRequest('endpoint is required');

  await ensurePushTable(db);
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
  return c.json({ ok: true });
});
