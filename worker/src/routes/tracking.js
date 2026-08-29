import { Hono } from 'hono';
import { newId } from '../lib/ids.js';
import { requireAdmin } from '../lib/adminAuth.js';

export const tracking = new Hono();

const EVENT_TYPES = ['page_view', 'cta_click'];

// db.exec() (unlike .prepare()) splits its input into statements by
// newline, so this has to stay on one line or it reads as multiple
// incomplete statements.
async function ensureTable(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS page_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, page TEXT NOT NULL, label TEXT, referrer TEXT, visitor_id TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
}

// Public, unauthenticated, write-only: the pitch page posts here directly.
// No PII collected — just event type, page, an optional CTA label, and a
// random client-generated visitor id (not derived from anything personal).
tracking.post('/', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { eventType, page, label, visitorId } = body;

  if (!EVENT_TYPES.includes(eventType) || !page) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'eventType and page are required' } }, 400);
  }

  await ensureTable(db);
  await db
    .prepare(
      `INSERT INTO page_events (id, event_type, page, label, referrer, visitor_id) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newId('evt'),
      eventType,
      String(page).slice(0, 64),
      label ? String(label).slice(0, 64) : null,
      c.req.header('referer')?.slice(0, 256) || null,
      visitorId ? String(visitorId).slice(0, 64) : null
    )
    .run();

  return c.json({ ok: true }, 201);
});

// Trackable outbound link for the pitch page. Published Artifacts run in a
// sandbox that silently blocks fetch()/XHR to arbitrary hosts, so a normal
// client-side "beacon" call never reaches this Worker. A plain top-level
// navigation isn't blocked the same way, so the pitch page's CTAs link here
// instead: we log the click, then redirect on to the real destination.
// `to` is checked against a fixed allowlist — never redirects to a caller-
// supplied URL, to avoid this becoming an open redirect.
const GO_DESTINATIONS = {
  live_app: 'https://rideshare-genesis.mupesashingy.workers.dev/',
  repo: 'https://github.com/ShingyMupesa/RideShare-Genesis',
};

tracking.get('/go', async (c) => {
  const db = c.env.DB;
  const to = c.req.query('to');
  const src = c.req.query('src');
  const destination = GO_DESTINATIONS[to];
  if (!destination) return c.text('Unknown destination', 400);

  await ensureTable(db);
  await db
    .prepare(`INSERT INTO page_events (id, event_type, page, label, referrer, visitor_id) VALUES (?, 'cta_click', 'pitch', ?, ?, NULL)`)
    .bind(newId('evt'), src ? `${to}:${String(src).slice(0, 32)}` : to, c.req.header('referer')?.slice(0, 256) || null)
    .run();

  return c.redirect(destination, 302);
});

// Everything below requires the admin token.
tracking.use('/stats', requireAdmin);

tracking.get('/stats', async (c) => {
  const db = c.env.DB;
  await ensureTable(db);

  const [pageViews, ctaClicks, byLabel, byDay, users, bookings, safetyCases, impact, cleanVehicles, revenue] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM page_events WHERE event_type = 'page_view'`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM page_events WHERE event_type = 'cta_click'`).first(),
    db
      .prepare(
        `SELECT label, COUNT(*) AS n FROM page_events WHERE event_type = 'cta_click' AND label IS NOT NULL GROUP BY label ORDER BY n DESC`
      )
      .all(),
    db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, event_type, COUNT(*) AS n
         FROM page_events
         WHERE created_at >= datetime('now', '-14 days')
         GROUP BY day, event_type
         ORDER BY day ASC`
      )
      .all(),
    db.prepare(`SELECT COUNT(*) AS n FROM users`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM bookings`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM safety_cases`).first(),
    // Estimated, not measured — see src/lib/impact.js for methodology.
    db
      .prepare(
        `SELECT
           COUNT(*) AS sharedJourneysCompleted,
           COALESCE(SUM(seats), 0) AS seatsUtilised,
           COALESCE(SUM(json_extract(impact_json, '$.vehicleKmAvoided')), 0) AS vehicleKmAvoided,
           COALESCE(SUM(json_extract(impact_json, '$.co2eKgAvoided')), 0) AS co2eKgAvoided,
           COALESCE(SUM(json_extract(impact_json, '$.fuelLitersAvoided')), 0) AS fuelLitersAvoided
         FROM bookings WHERE status = 'COMPLETED'`
      )
      .first(),
    db
      .prepare(
        `SELECT
           COUNT(*) AS withVehicleType,
           SUM(CASE WHEN vehicle_type IN ('electric', 'hybrid') THEN 1 ELSE 0 END) AS clean
         FROM journeys WHERE type = 'offer' AND vehicle_type IS NOT NULL`
      )
      .first(),
    // commission_rate/commission_amount may not exist yet on a fresh table
    // that's never taken a payment (see payments.js's ensureCommissionColumns);
    // tolerate that rather than 500ing the whole dashboard.
    db
      .prepare(
        `SELECT
           COALESCE(SUM(amount), 0) AS grossCaptured,
           COALESCE(SUM(commission_amount), 0) AS commissionCollected
         FROM payments WHERE status = 'CAPTURED'`
      )
      .first()
      .catch(() => ({ grossCaptured: 0, commissionCollected: 0 })),
  ]);

  return c.json({
    pageViews: pageViews?.n || 0,
    ctaClicks: ctaClicks?.n || 0,
    ctaByLabel: byLabel.results || [],
    dailySeries: byDay.results || [],
    productMetrics: {
      totalUsers: users?.n || 0,
      totalBookings: bookings?.n || 0,
      totalSafetyCases: safetyCases?.n || 0,
    },
    revenue: {
      grossCaptured: round1(revenue?.grossCaptured),
      commissionCollected: round1(revenue?.commissionCollected),
      note: 'Commission rate defaults to 0% during the early-bird period; the rate charged is stored per-payment, so past totals stay accurate if the rate changes.',
    },
    environmentalImpact: {
      sharedJourneysCompleted: impact?.sharedJourneysCompleted || 0,
      seatsUtilised: impact?.seatsUtilised || 0,
      vehicleKmAvoided: round1(impact?.vehicleKmAvoided),
      co2eKgAvoided: round1(impact?.co2eKgAvoided),
      fuelLitersAvoided: round1(impact?.fuelLitersAvoided),
      cleanVehiclePct: cleanVehicles?.withVehicleType
        ? Math.round((cleanVehicles.clean / cleanVehicles.withVehicleType) * 100)
        : null,
      methodology: 'Estimated, not measured — see the platform methodology note for how these figures are derived.',
    },
    generatedAt: new Date().toISOString(),
  });
});

function round1(n) {
  return Math.round((n || 0) * 10) / 10;
}
