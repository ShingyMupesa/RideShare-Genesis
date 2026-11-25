import { resolveAdminPrincipal, canAccess } from './adminTeam.js';

// Gate for every admin API route. Accepts either a personal admin session
// (issued by POST /api/admin-team/session after password re-entry — see
// lib/adminTeam.js for the full security model) or the legacy break-glass
// ADMIN_TOKEN. Role permissions are enforced here per API area and per
// read/write, so individual routes don't each need their own check.
export async function requireAdmin(c, next) {
  const principal = await resolveAdminPrincipal(c);
  if (!principal) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Admin sign-in required, or your admin session has expired' } }, 401);
  }
  if (!canAccess(principal, c.req.path, c.req.method)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Your admin role does not allow this action' } }, 403);
  }
  c.set('admin', principal);
  await next();
}
