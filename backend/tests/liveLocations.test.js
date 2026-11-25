import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { buildTestApp } from './helpers/testApp.js';

describe('live locations (GPS pipeline)', () => {
  let app;
  let cleanup;
  let driverToken;
  let riderToken;
  let strangerToken;
  let adminToken;
  let bookingId;
  let server;
  let port;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'lldriver@example.com',
      password: 'supersecret1',
      fullName: 'Leo Driver',
      acceptedTerms: true,
    });
    driverToken = driver.body.token;

    const rider = await request(app).post('/api/users/register').send({
      email: 'llrider@example.com',
      password: 'supersecret1',
      fullName: 'Ria Rider',
      acceptedTerms: true,
    });
    riderToken = rider.body.token;

    const stranger = await request(app).post('/api/users/register').send({
      email: 'llstranger@example.com',
      password: 'supersecret1',
      fullName: 'Stan Stranger',
      acceptedTerms: true,
    });
    strangerToken = stranger.body.token;

    const admin = await request(app).post('/api/users/register').send({
      email: 'lladmin@example.com',
      password: 'supersecret1',
      fullName: 'Lia Admin',
      acceptedTerms: true,
    });
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'lladmin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;

    const journeyRes = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        type: 'offer',
        origin: { label: 'Nairobi CBD', lat: -1.283, lng: 36.817 },
        destination: { label: 'JKIA', lat: -1.319, lng: 36.927 },
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
        seats: 2,
        pricePerSeat: 20,
        currency: 'USD',
      });

    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ journeyId: journeyRes.body.journey.id, seats: 1 });
    bookingId = bookingRes.body.booking.id;

    // Wire up a real Socket.IO server + attachSocket, the same way
    // src/server.js does, so the 'location:ping' handler can be exercised
    // end to end (auth middleware, room broadcast, throttled persistence).
    const { JWT_SECRET } = await import('../src/middleware/auth.js');
    const { attachSocket } = await import('../src/messaging/socket.js');

    server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });
    io.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('unauthorized'));
        const payload = jwt.verify(token, JWT_SECRET);
        socket.user = { id: payload.sub, email: payload.email };
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
    attachSocket(io);

    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    cleanup();
  });

  function connectClient(token) {
    return ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
  }

  test('a location:ping broadcasts to the other booking participant and persists to live_locations', async () => {
    const driverSocket = connectClient(driverToken);
    const riderSocket = connectClient(riderToken);

    await Promise.all([
      new Promise((resolve) => driverSocket.on('connect', resolve)),
      new Promise((resolve) => riderSocket.on('connect', resolve)),
    ]);

    driverSocket.emit('booking:join', bookingId);
    riderSocket.emit('booking:join', bookingId);
    // Give the server a beat to process the room joins before pinging.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const updatePromise = new Promise((resolve) => riderSocket.once('location:update', resolve));
    driverSocket.emit('location:ping', { bookingId, lat: -1.3, lng: 36.85, heading: 90 });

    const update = await updatePromise;
    assert.equal(update.lat, -1.3);
    assert.equal(update.lng, 36.85);
    assert.equal(update.heading, 90);
    assert.ok(update.at);

    // First ping for this booking should always persist (throttle starts
    // unset) — a real row should now exist in live_locations.
    const { listActiveLiveLocations } = await import('../src/liveLocations/repository.js');
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the (sync) db write land
    const active = listActiveLiveLocations();
    const row = active.find((r) => r.bookingId === bookingId);
    assert.ok(row, 'expected a persisted live_locations row');
    assert.equal(row.lat, -1.3);
    assert.equal(row.lng, 36.85);
    assert.equal(row.routeLabel, 'Nairobi CBD → JKIA');

    driverSocket.disconnect();
    riderSocket.disconnect();
  });

  test('a second ping within 15s still broadcasts but does not overwrite the throttled persisted row', async () => {
    const driverSocket = connectClient(driverToken);
    const riderSocket = connectClient(riderToken);

    await Promise.all([
      new Promise((resolve) => driverSocket.on('connect', resolve)),
      new Promise((resolve) => riderSocket.on('connect', resolve)),
    ]);
    driverSocket.emit('booking:join', bookingId);
    riderSocket.emit('booking:join', bookingId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const updatePromise = new Promise((resolve) => riderSocket.once('location:update', resolve));
    // A deliberately different position from the previous test's persisted row.
    driverSocket.emit('location:ping', { bookingId, lat: -1.31, lng: 36.86, heading: 95 });

    const update = await updatePromise;
    assert.equal(update.lat, -1.31); // broadcast always happens, every ping

    const { listActiveLiveLocations } = await import('../src/liveLocations/repository.js');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const active = listActiveLiveLocations();
    const row = active.find((r) => r.bookingId === bookingId);
    // Persistence is throttled to once per 15s per booking — this ping
    // landed well within that window of the previous test's persisted
    // write, so the stored row should be unchanged.
    assert.equal(row.lat, -1.3);
    assert.equal(row.lng, 36.85);

    driverSocket.disconnect();
    riderSocket.disconnect();
  });

  test('a stranger with no access to the booking cannot trigger a broadcast', async () => {
    const strangerSocket = connectClient(strangerToken);
    const riderSocket = connectClient(riderToken);

    await Promise.all([
      new Promise((resolve) => strangerSocket.on('connect', resolve)),
      new Promise((resolve) => riderSocket.on('connect', resolve)),
    ]);
    riderSocket.emit('booking:join', bookingId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    let received = false;
    riderSocket.once('location:update', () => {
      received = true;
    });
    // The stranger never joined the room (canAccessBooking fails), so this
    // ping is silently dropped server-side.
    strangerSocket.emit('location:ping', { bookingId, lat: 0, lng: 0 });
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.equal(received, false);

    strangerSocket.disconnect();
    riderSocket.disconnect();
  });

  test('GET /api/admin/live-map requires auth', async () => {
    const res = await request(app).get('/api/admin/live-map');
    assert.equal(res.status, 401);
  });

  test('GET /api/admin/live-map rejects a non-admin', async () => {
    const res = await request(app).get('/api/admin/live-map').set('Authorization', `Bearer ${riderToken}`);
    assert.equal(res.status, 403);
  });

  test('GET /api/admin/live-map lists the currently-active booking for an admin', async () => {
    const res = await request(app).get('/api/admin/live-map').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.active));
    const row = res.body.active.find((r) => r.bookingId === bookingId);
    assert.ok(row, 'expected the actively-tracked booking in the response');
    assert.equal(row.routeLabel, 'Nairobi CBD → JKIA');
  });

  test('a stale ping (older than 2 minutes) is excluded from the active list', async () => {
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE live_locations SET updated_at = datetime('now', '-3 minutes') WHERE booking_id = ?").run(bookingId);

    const res = await request(app).get('/api/admin/live-map').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(res.status, 200);
    assert.ok(!res.body.active.some((r) => r.bookingId === bookingId));
  });
});
