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
import { ApiError } from './utils/errors.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || '*',
    })
  );
  app.use(express.json({ limit: '1mb' }));

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
