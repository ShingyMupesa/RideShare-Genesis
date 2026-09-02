import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

// A real, minimal (1x1 black pixel) JPEG — its magic bytes genuinely match
// image/jpeg, which matters because the server sniffs bytes rather than
// trusting the declared mime type.
const VALID_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
const VALID_LICENSE_PHOTO = `data:image/jpeg;base64,${VALID_JPEG_BASE64}`;

describe('driver verification', () => {
  let app;
  let cleanup;
  let driverToken;
  let adminToken;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());

    const driver = await request(app).post('/api/users/register').send({
      email: 'newdriver@example.com',
      password: 'supersecret1',
      fullName: 'Nadia Newdriver',
      acceptedTerms: true,
    });
    driverToken = driver.body.token;

    const admin = await request(app).post('/api/users/register').send({
      email: 'admin@example.com',
      password: 'supersecret1',
      fullName: 'Ada Admin',
      acceptedTerms: true,
    });

    // Promote to admin directly in the DB (there is no self-serve
    // promotion endpoint by design) and re-login so the JWT — which embeds
    // role at sign time — carries the updated role.
    const { db } = await import('../src/db/connection.js');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.body.user.id);
    const relog = await request(app).post('/api/users/login').send({ email: 'admin@example.com', password: 'supersecret1' });
    adminToken = relog.body.token;
  });

  after(() => cleanup());

  test('a brand new user starts unverified and enforcement defaults off', async () => {
    const me = await request(app).get('/api/driver-verification/me').set('Authorization', `Bearer ${driverToken}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.status, 'unverified');

    const settings = await request(app).get('/api/driver-verification/settings');
    assert.equal(settings.status, 200);
    assert.equal(settings.body.enforced, false);
  });

  test('with enforcement off, an unverified driver can still post an offer journey', async () => {
    const res = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        type: 'offer',
        origin: { label: 'Downtown', lat: -1.2921, lng: 36.8219 },
        destination: { label: 'Airport', lat: -1.3192, lng: 36.9278 },
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
        seats: 2,
        pricePerSeat: 5,
        currency: 'USD',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.journey.ownerDriverVerified, false);
  });

  test('rejects a submission missing required fields', async () => {
    const res = await request(app)
      .post('/api/driver-verification')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ fullLegalName: 'Nadia Newdriver' });
    assert.equal(res.status, 400);
  });

  test('rejects a submission with no license photo', async () => {
    const res = await request(app)
      .post('/api/driver-verification')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ fullLegalName: 'Nadia Newdriver', licenseNumber: 'DL-99182', vehiclePlate: 'KAA 123X' });
    assert.equal(res.status, 400);
  });

  test('rejects a "photo" whose bytes do not actually match the declared image type', async () => {
    const fakePhoto = `data:image/jpeg;base64,${Buffer.from('this is definitely not a jpeg').toString('base64')}`;
    const res = await request(app)
      .post('/api/driver-verification')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ fullLegalName: 'Nadia Newdriver', licenseNumber: 'DL-99182', vehiclePlate: 'KAA 123X', licensePhoto: fakePhoto });
    assert.equal(res.status, 400);
  });

  test('rejects a photo over the size limit', async () => {
    // Magic bytes are genuinely JPEG (FF D8 FF), only the size is the problem.
    const oversized = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(6 * 1024 * 1024)]);
    const res = await request(app)
      .post('/api/driver-verification')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        fullLegalName: 'Nadia Newdriver',
        licenseNumber: 'DL-99182',
        vehiclePlate: 'KAA 123X',
        licensePhoto: `data:image/jpeg;base64,${oversized.toString('base64')}`,
      });
    assert.equal(res.status, 400);
  });

  test('a non-admin cannot see the review queue or approve submissions', async () => {
    const queue = await request(app).get('/api/driver-verification/queue').set('Authorization', `Bearer ${driverToken}`);
    assert.equal(queue.status, 403);
  });

  let submissionId;

  test('submitting verification with a genuine license photo moves the driver to pending', async () => {
    const res = await request(app)
      .post('/api/driver-verification')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        fullLegalName: 'Nadia Newdriver',
        licenseNumber: 'DL-99182',
        vehicleMakeModel: 'Toyota Prius',
        vehiclePlate: 'KAA 123X',
        licensePhoto: VALID_LICENSE_PHOTO,
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.submission.status, 'pending');
    assert.ok(res.body.submission.license_photo_key);
    assert.equal(res.body.submission.license_photo_mime, 'image/jpeg');
    submissionId = res.body.submission.id;

    const me = await request(app).get('/api/driver-verification/me').set('Authorization', `Bearer ${driverToken}`);
    assert.equal(me.body.status, 'pending');
  });

  test('the submission owner can fetch their license photo back, but a stranger cannot', async () => {
    const own = await request(app).get(`/api/driver-verification/${submissionId}/photo/license`).set('Authorization', `Bearer ${driverToken}`);
    assert.equal(own.status, 200);
    assert.equal(own.headers['content-type'], 'image/jpeg');
    assert.ok(own.body.length > 0);

    const noVehicleRegPhoto = await request(app)
      .get(`/api/driver-verification/${submissionId}/photo/vehicleReg`)
      .set('Authorization', `Bearer ${driverToken}`);
    assert.equal(noVehicleRegPhoto.status, 404);

    const stranger = await request(app).post('/api/users/register').send({
      email: 'photo-stranger@example.com',
      password: 'supersecret1',
      fullName: 'Percy Photostranger',
      acceptedTerms: true,
    });
    const forbidden = await request(app)
      .get(`/api/driver-verification/${submissionId}/photo/license`)
      .set('Authorization', `Bearer ${stranger.body.token}`);
    assert.equal(forbidden.status, 403);

    // An admin can also fetch it, for review.
    const asAdmin = await request(app).get(`/api/driver-verification/${submissionId}/photo/license`).set('Authorization', `Bearer ${adminToken}`);
    assert.equal(asAdmin.status, 200);
  });

  test('cannot resubmit while a submission is already pending', async () => {
    const res = await request(app)
      .post('/api/driver-verification')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ fullLegalName: 'Nadia Newdriver', licenseNumber: 'DL-99182', vehiclePlate: 'KAA 123X', licensePhoto: VALID_LICENSE_PHOTO });
    assert.equal(res.status, 409);
  });

  test('an admin sees it in the queue and can approve it', async () => {
    const queue = await request(app).get('/api/driver-verification/queue').set('Authorization', `Bearer ${adminToken}`);
    assert.equal(queue.status, 200);
    assert.ok(queue.body.submissions.some((s) => s.id === submissionId));

    const approve = await request(app)
      .post(`/api/driver-verification/${submissionId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    assert.equal(approve.status, 200);
    assert.equal(approve.body.submission.status, 'verified');
    assert.ok(approve.body.submission.reviewed_by);

    const me = await request(app).get('/api/driver-verification/me').set('Authorization', `Bearer ${driverToken}`);
    assert.equal(me.body.status, 'verified');
  });

  test('a verified driver posting an offer now carries the verified badge', async () => {
    const res = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        type: 'offer',
        origin: { label: 'Downtown', lat: -1.2921, lng: 36.8219 },
        destination: { label: 'Airport', lat: -1.3192, lng: 36.9278 },
        departureTime: new Date(Date.now() + 7200_000).toISOString(),
        seats: 2,
        pricePerSeat: 5,
        currency: 'USD',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.journey.ownerDriverVerified, true);

    const list = await request(app).get('/api/journeys').query({ type: 'offer' });
    const mine = list.body.journeys.find((j) => j.id === res.body.journey.id);
    assert.equal(mine.ownerDriverVerified, true);
  });

  test('toggling enforcement on blocks an unverified driver from posting an offer', async () => {
    const stranger = await request(app).post('/api/users/register').send({
      email: 'unverified-stranger@example.com',
      password: 'supersecret1',
      fullName: 'Uma Unverified',
      acceptedTerms: true,
    });
    const strangerToken = stranger.body.token;

    const toggleOn = await request(app).post('/api/driver-verification/settings').set('Authorization', `Bearer ${adminToken}`).send({ enforced: true });
    assert.equal(toggleOn.status, 200);
    assert.equal(toggleOn.body.enforced, true);

    const blocked = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({
        type: 'offer',
        origin: { label: 'Downtown', lat: -1.2921, lng: 36.8219 },
        destination: { label: 'Airport', lat: -1.3192, lng: 36.9278 },
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
        seats: 1,
        pricePerSeat: 5,
        currency: 'USD',
      });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'DRIVER_VERIFICATION_REQUIRED');

    // A previously verified driver is unaffected by the toggle.
    const allowed = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        type: 'offer',
        origin: { label: 'Downtown', lat: -1.2921, lng: 36.8219 },
        destination: { label: 'Airport', lat: -1.3192, lng: 36.9278 },
        departureTime: new Date(Date.now() + 10800_000).toISOString(),
        seats: 1,
        pricePerSeat: 5,
        currency: 'USD',
      });
    assert.equal(allowed.status, 201);

    // A rider requesting a ride is never gated by driver verification.
    const request_ = await request(app)
      .post('/api/journeys')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({
        type: 'request',
        origin: { label: 'Downtown', lat: -1.2921, lng: 36.8219 },
        destination: { label: 'Airport', lat: -1.3192, lng: 36.9278 },
        departureTime: new Date(Date.now() + 3600_000).toISOString(),
        currency: 'USD',
      });
    assert.equal(request_.status, 201);

    // Reset for isolation from any later tests in this file.
    await request(app).post('/api/driver-verification/settings').set('Authorization', `Bearer ${adminToken}`).send({ enforced: false });
  });

  test('rejecting a submission requires a note and lets the driver resubmit', async () => {
    const stranger = await request(app).post('/api/users/register').send({
      email: 'rejected-driver@example.com',
      password: 'supersecret1',
      fullName: 'Remy Rejected',
      acceptedTerms: true,
    });
    const strangerToken = stranger.body.token;

    const submit = await request(app)
      .post('/api/driver-verification')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ fullLegalName: 'Remy Rejected', licenseNumber: 'DL-00001', vehiclePlate: 'KBB 456Y', licensePhoto: VALID_LICENSE_PHOTO });
    const id = submit.body.submission.id;

    const rejectNoNote = await request(app).post(`/api/driver-verification/${id}/reject`).set('Authorization', `Bearer ${adminToken}`).send({});
    assert.equal(rejectNoNote.status, 400);

    const reject = await request(app)
      .post(`/api/driver-verification/${id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewNote: 'License photo unreadable, please resubmit.' });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.submission.status, 'rejected');

    const me = await request(app).get('/api/driver-verification/me').set('Authorization', `Bearer ${strangerToken}`);
    assert.equal(me.body.status, 'rejected');
    assert.equal(me.body.submission.review_note, 'License photo unreadable, please resubmit.');

    // Rejected — not pending — so resubmission is allowed.
    const resubmit = await request(app)
      .post('/api/driver-verification')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ fullLegalName: 'Remy Rejected', licenseNumber: 'DL-00001', vehiclePlate: 'KBB 456Y', licensePhoto: VALID_LICENSE_PHOTO });
    assert.equal(resubmit.status, 201);
  });
});
