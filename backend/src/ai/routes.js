import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler, BadRequest } from '../utils/errors.js';
import { answerAssistantQuestion } from './assistant.js';
import { isAnthropicConfigured } from './anthropicClient.js';
import { getProfile } from '../users/repository.js';

export const router = Router();

router.get('/status', (req, res) => {
  res.json({ enriched: isAnthropicConfigured(), mode: isAnthropicConfigured() ? 'anthropic+rules' : 'rules-only' });
});

// Genesis AI assistant concept: a lightweight, always-available in-app
// assistant. Falls back to fully transparent rule-based answers when no
// external model is configured, so the assistant is never a hard dependency.
router.post(
  '/assistant',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { message } = req.body || {};
    if (!message) throw BadRequest('message is required');

    const context = {};
    if (req.user) {
      const profile = getProfile(req.user.id);
      if (profile) context.decisionDna = profile.decision_dna;
    }

    const answer = await answerAssistantQuestion(message, context);
    res.json(answer);
  })
);
