import { TooManyRequests } from './errors.js';

// Fixed-window counter kept in the isolate's module scope. Workers reuse
// the same isolate (and this module state) across many requests before
// eviction, so this is a real — if best-effort, not globally coordinated
// across every edge location — brake on brute-force login/register/reset
// attempts and on AI/feedback cost abuse, without needing a KV or D1
// round-trip on every single request.
const buckets = new Map();

function clientKey(c) {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
}

export function rateLimit({ windowMs, max, message, name }) {
  return async (c, next) => {
    const key = `${name}:${clientKey(c)}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > max) {
        throw TooManyRequests(message);
      }
    }

    // Opportunistic cleanup so `buckets` doesn't grow unbounded over the
    // isolate's lifetime — cheap relative to the request itself.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (now >= v.resetAt) buckets.delete(k);
      }
    }

    await next();
  };
}

export const loginLimiter = rateLimit({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

export const registerLimiter = rateLimit({
  name: 'register',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many accounts created from this network. Please try again later.',
});

export const forgotPasswordLimiter = rateLimit({
  name: 'forgot-password',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please try again later.',
});

export const assistantLimiter = rateLimit({
  name: 'assistant',
  windowMs: 60 * 1000,
  max: 20,
  message: 'Genesis is getting a lot of questions right now — please wait a moment and try again.',
});

export const feedbackLimiter = rateLimit({
  name: 'feedback',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too much feedback from this network at once. Please try again later.',
});

// Each call sends a real "enter your PIN" prompt to a real phone — without
// this, the endpoint could be used to spam an arbitrary Kenyan number with
// M-Pesa prompts (the caller doesn't have to be paying with their own
// line). Tight enough to block abuse, loose enough for a legitimate payer
// who missed the prompt and needs to retry a couple of times.
export const mpesaLimiter = rateLimit({
  name: 'mpesa',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many M-Pesa payment attempts from this network. Please wait a few minutes and try again.',
});
