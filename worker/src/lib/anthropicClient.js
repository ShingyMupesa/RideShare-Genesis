// Minimal Anthropic client using the Workers-native fetch + AbortController.
// Entirely optional: the AI Gateway works with fully deterministic,
// rule-based responses when no key is configured, and this call is always
// wrapped so a network failure never breaks the Genesis assistant.

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-3-5-haiku-20241022';
const TIMEOUT_MS = 8000;

export function isAnthropicConfigured(env) {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export async function askClaude(env, systemPrompt, userMessage) {
  if (!isAnthropicConfigured(env)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data?.content?.[0]?.text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
