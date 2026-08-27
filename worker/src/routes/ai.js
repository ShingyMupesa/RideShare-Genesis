import { Hono } from 'hono';
import { optionalAuth } from '../lib/auth.js';
import { BadRequest } from '../lib/errors.js';
import { answerAssistantQuestion } from '../lib/assistant.js';
import { isAnthropicConfigured } from '../lib/anthropicClient.js';

export const ai = new Hono();

ai.get('/status', (c) => {
  const enriched = isAnthropicConfigured(c.env);
  return c.json({ enriched, mode: enriched ? 'anthropic+rules' : 'rules-only' });
});

ai.post('/assistant', optionalAuth, async (c) => {
  const authUser = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { message } = body;
  if (!message) throw BadRequest('message is required');

  const context = {};
  if (authUser) {
    const profile = await c.env.DB.prepare('SELECT decision_dna_json FROM profiles WHERE user_id = ?').bind(authUser.id).first();
    if (profile) context.decisionDna = JSON.parse(profile.decision_dna_json);
  }

  const answer = await answerAssistantQuestion(c.env, message, context);
  return c.json(answer);
});
