import jwt from 'jsonwebtoken';
import { Unauthorized } from '../utils/errors.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(Unauthorized('Missing or malformed Authorization header'));
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(Unauthorized('Invalid or expired token'));
  }
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
    } catch {
      // ignore invalid token on optional routes
    }
  }
  next();
}
