import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../lib/auth.js';
import { BadRequest, Forbidden, NotFound, Unauthorized, ApiError } from '../lib/errors.js';
import { recordAuditEvent } from '../lib/audit.js';
import { loginLimiter, rateLimit } from '../lib/rateLimit.js';
import { setSetting } from '../lib/platformSettings.js';
import { notifyOwner, ownerEmailHtml, appOrigin } from '../lib/ownerNotify.js';
import {
  ROLES,
  MAX_FAILED_LOGINS,
  LOCKOUT_MINUTES,
  SESSION_TTL_SECONDS,
  ensureAdminTeamTables,
  getOwnerUserId,
  ownerSessionVersion,
  signAdminSession,
  resolveAdminPrincipal,
  permissionsSummary,
} from '../lib/adminTeam.js';

// See lib/adminTeam.js for the security model this implements.
export const adminTeam = new Hono();

const requestLimiter = rateLimit({
  name: 'admin-access-request',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many admin access requests. Please try again later.',
});

const GENERIC_LOGIN_ERROR = 'Invalid credentials, or this account does not have admin access';

async function setup(c) {
  await ensureAdminTeamTables(c.env.DB);
}

// ---- Lockout ------------------------------------------------------------

async function isLocked(db, userId) {
  const row = await db
    .prepare('SELECT locked_until FROM admin_login_guard WHERE user_id = ? AND locked_until > CURRENT_TIMESTAMP')
    .bind(userId)
    .first();
  return !!row;
}

async function recordFailure(db, userId) {
  await db
    .prepare(
      `INSERT INTO admin_login_guard (user_id, failed_logins, updated_at) VALUES (?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET failed_logins = failed_logins + 1, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(userId)
    .run();
  await db
    .prepare(
      `UPDATE admin_login_guard SET locked_until = datetime('now', ?), failed_logins = 0
       WHERE user_id = ? AND failed_logins >= ?`
    )
    .bind(`+${LOCKOUT_MINUTES} minutes`, userId, MAX_FAILED_LOGINS)
    .run();
}

async function clearFailures(db, userId) {
  await db.prepare('UPDATE admin_login_guard SET failed_logins = 0, locked_until = NULL WHERE user_id = ?').bind(userId).run();
}

// ---- Sign-in: password re-entry -> short-lived admin session ------------

adminTeam.post('/session', loginLimiter, async (c) => {
  await setup(c);
  const db = c.env.DB;
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password) throw BadRequest('Email and password are required');

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(String(email).toLowerCase().trim()).first();
  if (!user) {
    await bcrypt.compare(password, '$2a$10$vZSv/bCwRjE/e5/pqcw8VurSd/CRgFM7RcC14GnDofpX25ePmd4s2'); // equalise timing
    throw Unauthorized(GENERIC_LOGIN_ERROR);
  }
  if (await isLocked(db, user.id)) {
    throw new ApiError(429, 'ADMIN_LOCKED', `Too many failed attempts. Admin sign-in for this account is locked for up to ${LOCKOUT_MINUTES} minutes.`);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await recordFailure(db, user.id);
    await recordAuditEvent(db, { actorId: user.id, eventType: 'admin.login_failed', entityType: 'admin_member', entityId: user.id });
    throw Unauthorized(GENERIC_LOGIN_ERROR);
  }

  const ownerId = await getOwnerUserId(db);
  let sessionVersion;
  if (ownerId && user.id === ownerId) {
    sessionVersion = await ownerSessionVersion(db, ownerId);
  } else {
    const member = await db.prepare('SELECT * FROM admin_members WHERE user_id = ?').bind(user.id).first();
    if (!member || member.status !== 'active' || !ROLES[member.role]) {
      await recordAuditEvent(db, { actorId: user.id, eventType: 'admin.login_denied', entityType: 'admin_member', entityId: user.id, metadata: { status: member?.status || 'none' } });
      throw Unauthorized(GENERIC_LOGIN_ERROR);
    }
    sessionVersion = member.session_version;
    await db.prepare('UPDATE admin_members SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?').bind(user.id).run();
  }

  await clearFailures(db, user.id);
  const token = await signAdminSession(c.env, { userId: user.id, sessionVersion });
  await recordAuditEvent(db, { actorId: user.id, eventType: 'admin.login', entityType: 'admin_member', entityId: user.id });
  return c.json({ token, expiresInSeconds: SESSION_TTL_SECONDS, name: user.full_name });
});

adminTeam.get('/session/me', async (c) => {
  await setup(c);
  const principal = await resolveAdminPrincipal(c);
  if (!principal) throw Unauthorized('Admin sign-in required, or your admin session has expired');
  let name = null;
  if (principal.userId) {
    const u = await c.env.DB.prepare('SELECT full_name, email FROM users WHERE id = ?').bind(principal.userId).first();
    name = u?.full_name || u?.email || null;
  }
  return c.json({ ...permissionsSummary(principal), name });
});

// Signs out every admin session for the caller (all devices).
adminTeam.post('/session/logout-all', async (c) => {
  await setup(c);
  const db = c.env.DB;
  const principal = await resolveAdminPrincipal(c);
  if (!principal?.userId) throw Unauthorized('Admin sign-in required');
  if (principal.kind === 'owner') {
    await setSetting(db, `owner_session_version:${principal.userId}`, String((await ownerSessionVersion(db, principal.userId)) + 1));
  } else {
    await db.prepare('UPDATE admin_members SET session_version = session_version + 1 WHERE user_id = ?').bind(principal.userId).run();
  }
  await recordAuditEvent(db, { actorId: principal.userId, eventType: 'admin.logout_all', entityType: 'admin_member', entityId: principal.userId });
  return c.json({ ok: true });
});

// ---- App users: see my admin status / request access --------------------

adminTeam.get('/status', requireAuth, async (c) => {
  await setup(c);
  const db = c.env.DB;
  const user = c.get('user');
  const ownerId = await getOwnerUserId(db);
  if (ownerId && user.id === ownerId) return c.json({ status: 'owner', role: 'owner', roleLabel: 'Owner' });
  const m = await db.prepare('SELECT status, role, requested_at FROM admin_members WHERE user_id = ?').bind(user.id).first();
  if (!m) return c.json({ status: 'none' });
  return c.json({ status: m.status, role: m.role, roleLabel: ROLES[m.role]?.label || null, requestedAt: m.requested_at });
});

adminTeam.post('/request', requireAuth, requestLimiter, async (c) => {
  await setup(c);
  const db = c.env.DB;
  const user = c.get('user');
  const ownerId = await getOwnerUserId(db);
  if (ownerId && user.id === ownerId) throw BadRequest('You are the Owner and already have full admin access');

  const { reason } = await c.req.json().catch(() => ({}));
  const cleanReason = String(reason || '').trim().slice(0, 500);
  if (cleanReason.length < 10) throw BadRequest('Please tell the Owner briefly why you need admin access (at least 10 characters)');

  const existing = await db.prepare('SELECT status FROM admin_members WHERE user_id = ?').bind(user.id).first();
  if (existing?.status === 'active') throw BadRequest('You already have admin access');
  if (existing?.status === 'pending') throw BadRequest('Your request is already waiting for the Owner');
  if (existing?.status === 'suspended') throw Forbidden('Your admin access is suspended. Contact the Owner.');

  await db
    .prepare(
      `INSERT INTO admin_members (user_id, role, status, request_reason, requested_at, updated_at)
       VALUES (?, NULL, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET status = 'pending', role = NULL, request_reason = excluded.request_reason,
         requested_at = CURRENT_TIMESTAMP, decided_by = NULL, decided_at = NULL, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(user.id, cleanReason)
    .run();
  await recordAuditEvent(db, { actorId: user.id, eventType: 'admin.access_requested', entityType: 'admin_member', entityId: user.id });

  const u = await db.prepare('SELECT email, full_name FROM users WHERE id = ?').bind(user.id).first();
  notifyOwner(c, {
    subject: `Admin Team access request: ${u?.full_name || u?.email}`,
    html: ownerEmailHtml({
      heading: 'Admin Team access request',
      intro: 'Someone has asked to join the Admin Team. Nothing is granted until you approve it and choose their role.',
      rows: [
        ['Name', u?.full_name || ''],
        ['Email', u?.email || ''],
        ['Reason', cleanReason],
      ],
      ctaUrl: `${appOrigin(c)}/admin#adminTeam`,
      ctaLabel: 'Review request',
    }),
  });
  return c.json({ status: 'pending' }, 201);
});

// ---- Team management (Owner, or a Super Admin the Owner appointed) ------

async function requireTeamManager(c) {
  await setup(c);
  const principal = await resolveAdminPrincipal(c);
  if (!principal) throw Unauthorized('Admin sign-in required, or your admin session has expired');
  if (!principal.manageTeam || !principal.userId) throw Forbidden('Only the Owner can manage the Admin Team');
  return principal;
}

// Every change to the team needs the actor's password again, so a stolen
// or unattended admin session can't be used to add accomplices.
async function confirmPassword(c, principal, password) {
  if (!password) throw BadRequest('Confirm your password to make Admin Team changes');
  const db = c.env.DB;
  if (await isLocked(db, principal.userId)) throw new ApiError(429, 'ADMIN_LOCKED', 'Too many failed attempts. Try again later.');
  const u = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(principal.userId).first();
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    await recordFailure(db, principal.userId);
    throw Unauthorized('Password is incorrect');
  }
  await clearFailures(db, principal.userId);
}

async function loadTarget(c, principal, userId) {
  const db = c.env.DB;
  const ownerId = await getOwnerUserId(db);
  if (userId === ownerId) throw Forbidden('The Owner cannot be changed from here');
  if (userId === principal.userId) throw Forbidden('You cannot change your own admin access');
  const member = await db.prepare('SELECT * FROM admin_members WHERE user_id = ?').bind(userId).first();
  if (!member) throw NotFound('No Admin Team record for this user');
  if (principal.kind !== 'owner' && member.role === 'super_admin') throw Forbidden('Only the Owner can change a Super Admin');
  return member;
}

function assertRoleGrantable(principal, role) {
  if (!ROLES[role]) throw BadRequest(`role must be one of: ${Object.keys(ROLES).join(', ')}`);
  if (role === 'super_admin' && principal.kind !== 'owner') throw Forbidden('Only the Owner can appoint a Super Admin');
}

// Oversight: when a Super Admin (not the Owner) changes the team, the
// Owner is told.
function tellOwnerIfDelegated(c, principal, summary) {
  if (principal.kind === 'owner') return;
  notifyOwner(c, {
    subject: `Admin Team change: ${summary}`,
    html: ownerEmailHtml({
      heading: 'Admin Team change',
      intro: 'A Super Admin changed the Admin Team.',
      rows: [['Change', summary]],
      ctaUrl: `${appOrigin(c)}/admin#adminTeam`,
      ctaLabel: 'Review Admin Team',
    }),
  });
}

async function audit(c, principal, eventType, targetId, metadata = {}) {
  await recordAuditEvent(c.env.DB, { actorId: principal.userId, eventType, entityType: 'admin_member', entityId: targetId, metadata: { actorRole: principal.role, ...metadata } });
}

async function userLabel(db, userId) {
  const u = await db.prepare('SELECT email, full_name FROM users WHERE id = ?').bind(userId).first();
  return u ? `${u.full_name || ''} <${u.email}>` : userId;
}

adminTeam.get('/members', async (c) => {
  const principal = await requireTeamManager(c);
  const db = c.env.DB;
  const ownerId = await getOwnerUserId(db);
  const owner = ownerId ? await db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').bind(ownerId).first() : null;
  const { results } = await db
    .prepare(
      `SELECT m.*, u.email, u.full_name, d.full_name AS decided_by_name
       FROM admin_members m JOIN users u ON u.id = m.user_id LEFT JOIN users d ON d.id = m.decided_by
       ORDER BY CASE m.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 WHEN 'suspended' THEN 2 ELSE 3 END, m.updated_at DESC`
    )
    .all();
  return c.json({
    you: permissionsSummary(principal),
    owner: owner ? { userId: owner.id, email: owner.email, fullName: owner.full_name } : null,
    roles: Object.entries(ROLES).map(([key, r]) => ({ key, label: r.label, description: r.description, ownerOnly: key === 'super_admin' })),
    members: results.map((m) => ({
      userId: m.user_id,
      email: m.email,
      fullName: m.full_name,
      role: m.role,
      roleLabel: ROLES[m.role]?.label || null,
      status: m.status,
      requestReason: m.request_reason,
      requestedAt: m.requested_at,
      decidedBy: m.decided_by_name,
      decidedAt: m.decided_at,
      lastLoginAt: m.last_login_at,
    })),
  });
});

// Add an existing app user straight onto the team.
adminTeam.post('/members', async (c) => {
  const principal = await requireTeamManager(c);
  const db = c.env.DB;
  const { email, role, password } = await c.req.json().catch(() => ({}));
  await confirmPassword(c, principal, password);
  assertRoleGrantable(principal, role);
  if (!email) throw BadRequest('email is required');
  const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(String(email).toLowerCase().trim()).first();
  if (!user) throw NotFound('No Genesis account uses that email. Ask them to register first.');
  const ownerId = await getOwnerUserId(db);
  if (user.id === ownerId || user.id === principal.userId) throw BadRequest('That account already has full access');
  const existing = await db.prepare('SELECT role FROM admin_members WHERE user_id = ?').bind(user.id).first();
  if (existing?.role === 'super_admin' && principal.kind !== 'owner') throw Forbidden('Only the Owner can change a Super Admin');

  await db
    .prepare(
      `INSERT INTO admin_members (user_id, role, status, decided_by, decided_at, updated_at)
       VALUES (?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, status = 'active', decided_by = excluded.decided_by,
         decided_at = CURRENT_TIMESTAMP, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(user.id, role, principal.userId)
    .run();
  await audit(c, principal, 'admin.member_added', user.id, { role });
  tellOwnerIfDelegated(c, principal, `${await userLabel(db, user.id)} added as ${ROLES[role].label}`);
  return c.json({ ok: true }, 201);
});

async function transition(c, { action, nextStatus, needsRole, allowedFrom }) {
  const principal = await requireTeamManager(c);
  const db = c.env.DB;
  const userId = c.req.param('userId');
  const body = await c.req.json().catch(() => ({}));
  await confirmPassword(c, principal, body.password);
  const member = await loadTarget(c, principal, userId);
  if (allowedFrom && !allowedFrom.includes(member.status)) {
    throw BadRequest(`Cannot ${action} a member whose status is ${member.status}`);
  }
  let role = member.role;
  if (needsRole) {
    assertRoleGrantable(principal, body.role);
    role = body.role;
  }
  if (nextStatus === 'active' && !ROLES[role]) throw BadRequest('Choose a role first');

  await db
    .prepare(
      `UPDATE admin_members SET status = ?, role = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP,
         session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
    )
    .bind(nextStatus, role, principal.userId, userId)
    .run();
  const note = String(body.reason || '').slice(0, 300) || undefined;
  await audit(c, principal, `admin.member_${action}`, userId, { from: member.status, to: nextStatus, role, note });
  tellOwnerIfDelegated(c, principal, `${await userLabel(db, userId)}: ${action}${needsRole ? ` as ${ROLES[role].label}` : ''}`);
  return c.json({ ok: true, status: nextStatus, role });
}

adminTeam.post('/members/:userId/approve', (c) => transition(c, { action: 'approved', nextStatus: 'active', needsRole: true, allowedFrom: ['pending'] }));
adminTeam.post('/members/:userId/reject', (c) => transition(c, { action: 'rejected', nextStatus: 'removed', allowedFrom: ['pending'] }));
adminTeam.post('/members/:userId/role', (c) => transition(c, { action: 'role_changed', nextStatus: 'active', needsRole: true, allowedFrom: ['active'] }));
adminTeam.post('/members/:userId/suspend', (c) => transition(c, { action: 'suspended', nextStatus: 'suspended', allowedFrom: ['active'] }));
adminTeam.post('/members/:userId/reactivate', (c) => transition(c, { action: 'reactivated', nextStatus: 'active', allowedFrom: ['suspended'] }));
adminTeam.post('/members/:userId/remove', (c) => transition(c, { action: 'removed', nextStatus: 'removed', allowedFrom: ['active', 'suspended', 'pending'] }));
