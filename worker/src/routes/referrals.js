import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { requireAdmin } from '../lib/adminAuth.js';
import { referralSummary, growthStats } from '../lib/referrals.js';

export const referrals = new Hono();
export const growthAdmin = new Hono();

referrals.get('/me', requireAuth, async (c) => {
  const summary = await referralSummary(c.env.DB, c.get('user').id);
  const u = new URL(c.req.url);
  const origin = c.env.APP_URL || (u.hostname === 'localhost' || u.hostname === '127.0.0.1' ? u.origin : `https://${u.host}`);
  return c.json({ ...summary, link: `${origin}/r/${summary.code}` });
});

growthAdmin.get('/', requireAdmin, async (c) => c.json(await growthStats(c.env.DB)));
