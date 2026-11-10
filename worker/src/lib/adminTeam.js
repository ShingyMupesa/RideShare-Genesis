// Admin Team: who may use the admin dashboard, with which role, and how
// they prove it.
//
// Security model
// --------------
// * The Owner is a single user account, pinned by user ID in the
//   `platform_settings` row `owner_user_id` (never by email, so nobody can
//   become Owner by registering an address). Only the Owner can grant the
//   super_admin role, and the Owner can never be suspended, removed or
//   demoted through the API.
// * Everyone else is a row in `admin_members` with a status
//   (pending | active | suspended | removed) and a role. Users can only
//   *request* access; an Owner (or a super_admin the Owner has appointed)
//   approves it and picks the role.
// * Signing in to the dashboard needs the account password again (not just
//   a logged-in app session) and issues a short-lived admin session token,
//   signed with a key derived from JWT_SECRET that ordinary app tokens are
//   never signed with, so an app token can't be replayed as an admin token.
// * Every admin request re-reads the member row. Suspending, removing or
//   changing someone's role bumps their session_version, which kills their
//   open sessions on the very next request.
// * Five wrong passwords lock admin sign-in for that account for 15 minutes
//   (stored in D1, so it holds across Worker isolates).
// * Permissions are checked per API area and per read/write. Unknown admin
//   routes are denied to everyone except the Owner and super_admins.
// * The legacy shared ADMIN_TOKEN still works as a break-glass key for the
//   data screens, but it can never manage the Admin Team.
import { signJwt, verifyJwt } from './jwt.js';
import { getSetting, ensurePlatformSettingsTable } from './platformSettings.js';

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export const AREAS = ['analytics', 'drivers', 'support', 'users', 'finance', 'config'];

// read = GET/HEAD only; write = everything.
export const ROLES = {
  super_admin: {
    label: 'Super Admin',
    description: 'Everything, including approving and managing Admin Team members (except the Owner and other Super Admins).',
    areas: Object.fromEntries(AREAS.map((a) => [a, 'write'])),
    manageTeam: true,
  },
  operations: {
    label: 'Operations Admin',
    description: 'Runs day-to-day operations: drivers, support, users. Can view finance and analytics.',
    areas: { analytics: 'read', drivers: 'write', support: 'write', users: 'write', finance: 'read' },
  },
  verifier: {
    label: 'Driver Verifier',
    description: 'Reviews and approves/rejects driver verification submissions.',
    areas: { drivers: 'write', analytics: 'read' },
  },
  support: {
    label: 'Support Agent',
    description: 'Handles disputes and feedback. Can view users and drivers.',
    areas: { support: 'write', users: 'read', drivers: 'read' },
  },
  finance: {
    label: 'Finance',
    description: 'Payments, subscriptions, revenue, ad slots and insurance partners.',
    areas: { finance: 'write', analytics: 'read' },
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to every data screen.',
    areas: Object.fromEntries(AREAS.map((a) => [a, 'read'])),
  },
};

// Longest-prefix-first. Anything not matched here is "unmapped" and fails
// closed (Owner/super_admin only).
const AREA_PREFIXES = [
  ['/api/admin/platform-settings', 'config'],
  ['/api/driver-verification/settings', 'config'],
  ['/api/driver-verification', 'drivers'],
  ['/api/disputes', 'support'],
  ['/api/feedback', 'support'],
  ['/api/admin/users', 'users'],
  ['/api/admin/rides', 'users'],
  ['/api/admin/payments', 'finance'],
  ['/api/admin/revenue', 'finance'],
  ['/api/admin/subscription-plans', 'finance'],
  ['/api/admin/subscriptions', 'finance'],
  ['/api/admin/ad-slots', 'finance'],
  ['/api/admin/insurance-partners', 'finance'],
  ['/api/admin/funnel-stats', 'analytics'],
  ['/api/admin/live-map', 'analytics'],
  ['/api/admin/user-locations', 'analytics'],
  ['/api/tracking', 'analytics'],
  ['/api/governance', 'analytics'],
];

export function areaForPath(path) {
  for (const [prefix, area] of AREA_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + '/')) return area;
  }
  return null;
}

let ensured = false;
export async function ensureAdminTeamTables(db) {
  if (ensured) return;
  await ensurePlatformSettingsTable(db);
  await db.exec(
    `CREATE TABLE IF NOT EXISTS admin_members (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, role TEXT, status TEXT NOT NULL DEFAULT 'pending', session_version INTEGER NOT NULL DEFAULT 1, request_reason TEXT, requested_at TEXT, decided_by TEXT, decided_at TEXT, last_login_at TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS admin_login_guard (user_id TEXT PRIMARY KEY, failed_logins INTEGER NOT NULL DEFAULT 0, locked_until TEXT, updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP))`
  );
  await db.exec('CREATE INDEX IF NOT EXISTS idx_admin_members_status ON admin_members(status)');
  ensured = true;
}

export async function getOwnerUserId(db) {
  await ensurePlatformSettingsTable(db);
  return (await getSetting(db, 'owner_user_id')) || null;
}

export async function getOwnerContact(db, env) {
  const ownerId = await getOwnerUserId(db);
  if (ownerId) {
    const row = await db.prepare('SELECT email, full_name FROM users WHERE id = ?').bind(ownerId).first();
    if (row?.email) return { email: row.email, name: row.full_name };
  }
  return env.OWNER_EMAIL ? { email: env.OWNER_EMAIL, name: 'Owner' } : null;
}

function sessionSecret(env) {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return `${env.JWT_SECRET}::genesis-admin-session::v1`;
}

export async function signAdminSession(env, { userId, sessionVersion }) {
  return signJwt({ sub: userId, adm: 1, sv: sessionVersion }, sessionSecret(env), SESSION_TTL_SECONDS);
}

/**
 * Resolves who an admin request comes from. Returns null when not an
 * admin. The Owner's session version lives in platform_settings so the
 * Owner can also sign all of their own sessions out.
 */
export async function resolveAdminPrincipal(c) {
  const db = c.env.DB;
  const supplied = c.req.header('x-admin-token') || c.req.query('token');
  if (!supplied) return null;

  if (c.env.ADMIN_TOKEN && timingSafeEqual(supplied, c.env.ADMIN_TOKEN)) {
    return { kind: 'break_glass', userId: null, role: 'break_glass', manageTeam: false, areas: ROLES.super_admin.areas };
  }

  let payload;
  try {
    payload = await verifyJwt(supplied, sessionSecret(c.env));
  } catch {
    return null;
  }
  if (payload?.adm !== 1 || !payload.sub) return null;

  await ensureAdminTeamTables(db);
  const ownerId = await getOwnerUserId(db);
  if (ownerId && payload.sub === ownerId) {
    if (Number(payload.sv) !== (await ownerSessionVersion(db, ownerId))) return null;
    return { kind: 'owner', userId: ownerId, role: 'owner', manageTeam: true, isOwner: true, areas: ROLES.super_admin.areas };
  }

  const member = await db.prepare('SELECT * FROM admin_members WHERE user_id = ?').bind(payload.sub).first();
  if (!member || member.status !== 'active' || !ROLES[member.role]) return null;
  if (Number(payload.sv) !== Number(member.session_version)) return null;
  const role = ROLES[member.role];
  return { kind: 'member', userId: member.user_id, role: member.role, manageTeam: !!role.manageTeam, areas: role.areas };
}

export async function ownerSessionVersion(db, ownerId) {
  const v = await getSetting(db, `owner_session_version:${ownerId}`);
  return Number(v || 1);
}

export function canAccess(principal, path, method) {
  if (!principal) return false;
  if (principal.kind === 'owner') return true;
  const area = areaForPath(path);
  if (!area) return principal.role === 'super_admin' || principal.kind === 'break_glass';
  const level = principal.areas[area];
  if (!level) return false;
  const isRead = method === 'GET' || method === 'HEAD';
  return isRead ? true : level === 'write';
}

export function permissionsSummary(principal) {
  return {
    role: principal.role,
    roleLabel: principal.role === 'owner' ? 'Owner' : principal.role === 'break_glass' ? 'Break-glass token' : ROLES[principal.role]?.label,
    isOwner: principal.kind === 'owner',
    manageTeam: !!principal.manageTeam,
    areas: principal.kind === 'owner' ? ROLES.super_admin.areas : principal.areas,
  };
}

// Constant-time string compare so the break-glass token can't be guessed
// byte-by-byte from response timing.
export function timingSafeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}
