import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler, BadRequest, Conflict, NotFound, Unauthorized } from '../utils/errors.js';
import { recordAuditEvent } from '../governance/auditLog.js';
import * as Users from './repository.js';
import { generateResetToken, hashResetToken } from './resetToken.js';
import { sendEmail, resetPasswordEmailHtml } from '../email/resend.js';
import { loginLimiter, registerLimiter, forgotPasswordLimiter } from '../middleware/rateLimit.js';

export const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post(
  '/register',
  registerLimiter,
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
  loginLimiter,
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

// Always responds with the same generic message whether or not the email
// matches an account — otherwise this endpoint would let anyone check
// which emails have accounts on Genesis.
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) throw BadRequest('A valid email is required');

    const genericResponse = { message: "If an account exists for that email, we've sent a reset link." };
    const user = Users.findUserByEmail(email.toLowerCase());
    if (!user) return res.json(genericResponse);

    const token = generateResetToken();
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    Users.createPasswordReset(user.id, tokenHash, expiresAt);

    const resetUrl = `${(process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/$/, '')}/reset-password?token=${token}`;

    if (process.env.RESEND_API_KEY) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset your RideShare Genesis password',
          html: resetPasswordEmailHtml({ resetUrl, fullName: user.full_name }),
          apiKey: process.env.RESEND_API_KEY,
          from: process.env.EMAIL_FROM || 'RideShare Genesis <onboarding@resend.dev>',
        });
      } catch (err) {
        console.error('[forgot-password] failed to send email:', err.message);
      }
    } else {
      console.warn('[forgot-password] RESEND_API_KEY not configured — no email sent. Reset link:', resetUrl);
    }

    recordAuditEvent({ actorId: user.id, eventType: 'user.password_reset_requested', entityType: 'user', entityId: user.id });
    res.json(genericResponse);
  })
);

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body || {};
    if (!token) throw BadRequest('token is required');
    if (!newPassword || newPassword.length < 8) throw BadRequest('Password must be at least 8 characters');

    const tokenHash = hashResetToken(token);
    const reset = Users.findValidPasswordReset(tokenHash);
    if (!reset) throw BadRequest('This reset link is invalid or has expired');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    Users.updatePasswordHash(reset.user_id, passwordHash);
    Users.markPasswordResetUsed(reset.id);

    const user = Users.getUserById(reset.user_id);
    const profile = Users.getProfile(user.id);
    recordAuditEvent({ actorId: user.id, eventType: 'user.password_reset', entityType: 'user', entityId: user.id });

    const authToken = signToken(user);
    res.json({ token: authToken, user: Users.publicUser(user, profile) });
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
