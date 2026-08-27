import { signJwt, verifyJwt } from './jwt.js';
import { Unauthorized } from './errors.js';

// Workers have no module-load-time "startup" the way a long-running Node
// process does — env/secrets are only available per-request via c.env. So
// the "refuse to start without JWT_SECRET" check happens here, on first use
// per request, rather than at import time.
function requireSecret(env) {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured. Set it with: wrangler secret put JWT_SECRET');
  }
  return env.JWT_SECRET;
}

export async function signToken(env, user) {
  const secret = requireSecret(env);
  const expiresIn = Number(env.JWT_EXPIRES_IN_SECONDS || 604800); // 7 days
  return signJwt({ sub: user.id, email: user.email, role: user.role }, secret, expiresIn);
}

function extractToken(c) {
  const header = c.req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

export async function requireAuth(c, next) {
  const token = extractToken(c);
  if (!token) throw Unauthorized('Missing or malformed Authorization header');

  const secret = requireSecret(c.env); // misconfiguration -> 500, not 401
  try {
    const payload = await verifyJwt(token, secret);
    c.set('user', { id: payload.sub, email: payload.email, role: payload.role });
  } catch {
    throw Unauthorized('Invalid or expired token');
  }
  await next();
}

export async function optionalAuth(c, next) {
  const token = extractToken(c);
  if (token && c.env.JWT_SECRET) {
    try {
      const payload = await verifyJwt(token, c.env.JWT_SECRET);
      c.set('user', { id: payload.sub, email: payload.email, role: payload.role });
    } catch {
      // ignore invalid token on optional routes
    }
  }
  await next();
}
