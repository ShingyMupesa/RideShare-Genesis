import { Hono } from 'hono';
import { requireAdmin } from '../lib/adminAuth.js';

export const adminUserLocations = new Hono();

// Geographic spread of real activity, not live tracking — plots each user's
// most recent journey's origin point (already collected when they post a
// journey; see worker/migrations/0001_init.sql's journeys.origin_lat/lng).
// Deliberately not continuous location tracking: a user who has never
// posted a journey has no pin, and a pin only moves when they post again.
adminUserLocations.get('/', requireAdmin, async (c) => {
  const db = c.env.DB;

  const { results } = await db
    .prepare(
      `SELECT u.id AS userId, u.full_name AS fullName, u.role AS role,
              j.origin_lat AS lat, j.origin_lng AS lng, j.origin_label AS label,
              j.created_at AS journeyCreatedAt
       FROM users u
       JOIN journeys j ON j.owner_id = u.id
       WHERE j.origin_lat IS NOT NULL AND j.origin_lng IS NOT NULL
         AND j.id = (
           SELECT j2.id FROM journeys j2
           WHERE j2.owner_id = u.id AND j2.origin_lat IS NOT NULL AND j2.origin_lng IS NOT NULL
           ORDER BY j2.created_at DESC LIMIT 1
         )
       ORDER BY j.created_at DESC
       LIMIT 500`
    )
    .all();

  return c.json({
    locations: results.map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      role: r.role,
      lat: r.lat,
      lng: r.lng,
      label: r.label,
      lastActivityAt: r.journeyCreatedAt,
    })),
    generatedAt: new Date().toISOString(),
  });
});
