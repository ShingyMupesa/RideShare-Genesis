import rateLimit from 'express-rate-limit';

// Throttles brute-force/credential-stuffing and email/AI-cost abuse. Keyed
// by IP by default (express-rate-limit's standard keyGenerator), which is
// enough here since none of these endpoints sit behind a shared corporate
// NAT we need to worry about at this stage.
function limiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
  });
}

export const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

export const registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many accounts created from this network. Please try again later.',
});

export const forgotPasswordLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please try again later.',
});

export const assistantLimiter = limiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Genesis is getting a lot of questions right now — please wait a moment and try again.',
});

export const feedbackLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too much feedback from this network at once. Please try again later.',
});

// Each call sends a real "enter your PIN" prompt to a real phone — without
// this, the endpoint could be used to spam an arbitrary Kenyan number with
// M-Pesa prompts (the caller doesn't have to be paying with their own
// line). Tight enough to block abuse, loose enough for a legitimate payer
// who missed the prompt and needs to retry a couple of times.
export const mpesaLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many M-Pesa payment attempts from this network. Please wait a few minutes and try again.',
});
