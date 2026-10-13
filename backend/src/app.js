import express from 'express';
import cors from 'cors';
import { router as usersRouter } from './users/routes.js';
import { router as journeysRouter } from './journeys/routes.js';
import { router as matchingRouter } from './matching/routes.js';
import { router as bookingsRouter } from './bookings/routes.js';
import { router as paymentsRouter } from './payments/routes.js';
import { router as messagingRouter } from './messaging/routes.js';
import { router as safetyRouter } from './safety/routes.js';
import { router as governanceRouter } from './governance/routes.js';
import { router as aiRouter } from './ai/routes.js';
import { router as feedbackRouter } from './feedback/routes.js';
import { router as pushRouter } from './push/routes.js';
import { router as driverVerificationRouter } from './driverVerification/routes.js';
import { ApiError } from './utils/errors.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || '*',
    })
  );
  // Driver-verification document photos, base64-encoded, need far more
  // room than the 1mb limit every other endpoint is happy with — sized
  // per-path (rather than raising the limit globally) so this is the only
  // JSON body parser that ever touches a given request.
  app.use((req, res, next) => {
    const limit = req.path.startsWith('/api/driver-verification') ? '14mb' : '1mb';
    express.json({ limit })(req, res, next);
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'rideshare-genesis-backend', time: new Date().toISOString() });
  });

  app.use('/api/users', usersRouter);
  app.use('/api/journeys', journeysRouter);
  app.use('/api/matching', matchingRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/messages', messagingRouter);
  app.use('/api/safety', safetyRouter);
  app.use('/api/governance', governanceRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/driver-verification', driverVerificationRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  });

  return app;
}
