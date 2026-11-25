import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, Forbidden } from '../utils/errors.js';
import { db } from '../db/connection.js';

export const router = Router();

function assertAdmin(req) {
  if (req.user.role !== 'admin') throw Forbidden('Admin access required');
}

// Mirrors worker/src/routes/adminUserLocations.js — see that file for the
// full rationale (geographic spread of real activity, not live tracking).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    assertAdmin(req);

    const rows = db
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

    res.json({
      locations: rows.map((r) => ({
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
  })
);
