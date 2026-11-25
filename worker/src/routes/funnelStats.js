import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';
import { ensureFunnelEventsTable, FUNNEL_EVENT_TYPES } from '../lib/funnelEvents.js';

export const funnelStats = new Hono();

// Powers the UX Metrics admin screen's funnel visualisation — real counts
// from funnel_events, no new tables. `days` selects the trailing window
// (default 30), capped at a year so a typo in the query string can't force
// a full-table scan.
funnelStats.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;
  await ensureFunnelEventsTable(db);

  const days = Math.min(365, Math.max(1, Number(c.req.query('days')) || 30));

  const { results } = await db
    .prepare(
      `SELECT event_type, COUNT(*) AS n FROM funnel_events
       WHERE created_at >= datetime('now', '-' || ? || ' days')
       GROUP BY event_type`
    )
    .bind(days)
    .all();

  const counts = Object.fromEntries(FUNNEL_EVENT_TYPES.map((t) => [t, 0]));
  for (const row of results) {
    if (Object.prototype.hasOwnProperty.call(counts, row.event_type)) counts[row.event_type] = row.n;
  }

  return c.json({
    windowDays: days,
    // Ordered as the real funnel progresses — the screen draws this
    // straight down as a stack of bars, no reordering needed.
    steps: FUNNEL_EVENT_TYPES.map((eventType) => ({ eventType, count: counts[eventType] })),
    generatedAt: new Date().toISOString(),
  });
});
