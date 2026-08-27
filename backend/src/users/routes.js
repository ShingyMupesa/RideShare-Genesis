import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Conflict, NotFound, Unauthorized } from '../utils/errors.js';
import { recordAuditEvent } from '../governance/auditLog.js';
import * as Users from './repository.js';

export const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, fullName, phone } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) throw BadRequest('A valid email is required');
    if (!password || password.length < 8) throw BadRequest('Password must be at least 8 characters');
    if (!fullName || !fullName.trim()) throw BadRequest('Full name is required');

    if (Users.findUserByEmail(email.toLowerCase())) {
      throw Conflict('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = Users.createUser({
      email: email.toLowerCase(),
      passwordHash,
      fullName: fullName.trim(),
      phone,
    });
    const profile = Users.getProfile(user.id);

    recordAuditEvent({
      actorId: user.id,
      eventType: 'user.registered',
      entityType: 'user',
      entityId: user.id,
    });

    const token = signToken(user);
    res.status(201).json({ token, user: Users.publicUser(user, profile) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw BadRequest('Email and password are required');

    const user = Users.findUserByEmail(email.toLowerCase());
    if (!user) throw Unauthorized('Invalid email or password');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw Unauthorized('Invalid email or password');

    const profile = Users.getProfile(user.id);
    const token = signToken(user);
    res.json({ token, user: Users.publicUser(user, profile) });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = Users.getUserById(req.user.id);
    if (!user) throw NotFound('User not found');
    const profile = Users.getProfile(user.id);
    res.json({ user: Users.publicUser(user, profile) });
  })
);

router.patch(
  '/me/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bio, homeCity, preferences, decisionDnaWeights, emergencyContactName, emergencyContactPhone } = req.body || {};
    const profile = Users.updateProfile(req.user.id, {
      bio,
      homeCity,
      preferences,
      decisionDnaWeights,
      emergencyContactName,
      emergencyContactPhone,
    });
    if (!profile) throw NotFound('Profile not found');

    const user = Users.getUserById(req.user.id);
    res.json({ user: Users.publicUser(user, profile) });
  })
);
