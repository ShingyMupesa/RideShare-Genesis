import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

describe('safety centre + AI gateway', () => {
  let app;
  let cleanup;
  let token;

  before(async () => {
    ({ app, cleanup } = await buildTestApp());
    const reg = await request(app).post('/api/users/register').send({
      email: 'safe@example.com',
      password: 'supersecret1',
      fullName: 'Safia User',
      acceptedTerms: true,
    });
    token = reg.body.token;
  });

  after(() => cleanup());

  test('triggers SOS and logs a critical safety case', async () => {
    const res = await request(app)
      .post('/api/safety/sos')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Driver went off route' });
    assert.equal(res.status, 201);
    assert.equal(res.body.safetyCase.severity, 'critical');
    assert.equal(res.body.safetyCase.category, 'sos');
    assert.ok(res.body.guidance);
  });

  test('files an incident report', async () => {
    const res = await request(app)
      .post('/api/safety/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'incident_report', severity: 'high', description: 'Vehicle did not match listing' });
    assert.equal(res.status, 201);
    assert.equal(res.body.safetyCase.status, 'open');
  });

  test('rejects a report with an invalid category', async () => {
    const res = await request(app)
      .post('/api/safety/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'not_a_category', description: 'x' });
    assert.equal(res.status, 400);
  });

  test('lists the user\'s own safety cases', async () => {
    const res = await request(app).get('/api/safety/mine').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.safetyCases.length >= 2);
  });

  test('reporter can resolve their own case', async () => {
    const listRes = await request(app).get('/api/safety/mine').set('Authorization', `Bearer ${token}`);
    const caseId = listRes.body.safetyCases[0].id;
    const res = await request(app).post(`/api/safety/${caseId}/resolve`).set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.safetyCase.status, 'resolved');
  });

  test('Genesis assistant answers a Decision DNA question deterministically without a key', async () => {
    const res = await request(app)
      .post('/api/ai/assistant')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Why did I get this match? Explain the decision dna.' });
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'genesis-rules');
    assert.match(res.body.reply, /proximity|timing|weight/i);
  });

  test('Genesis assistant works for anonymous users too', async () => {
    const res = await request(app).post('/api/ai/assistant').send({ message: 'hello' });
    assert.equal(res.status, 200);
    assert.ok(res.body.reply.length > 0);
  });

  test('ai status reports rules-only mode without ANTHROPIC_API_KEY', async () => {
    const res = await request(app).get('/api/ai/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.enriched, false);
  });
});
