// Minimal shared-secret gate for the admin dashboard. Not a full user/role
// system — just enough to keep pitch-page analytics and product counts
// private to whoever holds ADMIN_TOKEN.
export async function requireAdmin(c, next) {
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 'NOT_CONFIGURED', message: 'ADMIN_TOKEN is not set on this Worker' } }, 500);
  }
  const supplied = c.req.header('x-admin-token') || c.req.query('token');
  if (supplied !== c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing admin token' } }, 401);
  }
  await next();
}
