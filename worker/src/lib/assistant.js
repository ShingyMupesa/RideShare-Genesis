import { askClaude, isAnthropicConfigured } from './anthropicClient.js';

const SYSTEM_PROMPT = `You are Genesis, the in-app assistant for RideShare Genesis, a
human-centred ridesharing platform. Be concise (under 120 words), warm, and
transparent. When explaining matches, always reference the Decision DNA
factors (proximity, timing, price, preferences, reliability) so the user
understands WHY a suggestion was made — never present it as a black box.
If asked about safety, always mention the Safety Centre and the SOS button.`;

const INTENTS = [
  {
    name: 'greeting',
    test: /^(hi|hello|hey|good (morning|afternoon|evening))\b/i,
    reply: () =>
      "Hi, I'm Genesis — your journey assistant. Ask me how matching works, what your Decision DNA means, how to pick a payment method, or how the Safety Centre works.",
  },
  {
    name: 'decision_dna',
    test: /decision dna|why (was|did) i match|how (does|do) matching work|match (score|explanation)/i,
    reply: () =>
      'Every match is scored transparently across five factors — proximity, timing, price fit, preference alignment, and driver reliability — using weights you can tune in your profile\'s Decision DNA settings. Open any match card and tap "Why this match?" to see the exact breakdown behind the score.',
  },
  {
    name: 'booking_workflow',
    test: /booking status|how (does|do) booking work|confirm(ed)? (my )?(ride|booking)/i,
    reply: () =>
      'Bookings move through REQUESTED → MATCHED → BOOKING_REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED. You can cancel from any step before COMPLETED. Check "My Journeys" for the live status of every booking.',
  },
  {
    name: 'payments',
    test: /payment|pay(ing)?|refund|card|mobile money|cash/i,
    reply: () =>
      'You can pay by card, mobile money, wallet balance, or arrange cash directly with your driver — pick whichever suits you at checkout. All electronic payments are processed through our sandboxed payment gateway and logged for your records.',
  },
  {
    name: 'safety',
    test: /safety|sos|emergency|unsafe|report (a )?(driver|passenger|incident)/i,
    reply: () =>
      'Your safety comes first. The Safety Centre has a one-tap SOS that logs an incident instantly and can alert your trusted contact, plus a form to report any concern after a trip. You can find it from the main menu at any time.',
  },
  {
    name: 'preferences',
    test: /preference|chatty|quiet|music|smoking|pets/i,
    reply: () =>
      'Set your ride preferences (chattiness, music, smoking, pets, luggage) in your Profile. Genesis uses them, alongside your Decision DNA weights, to prioritise matches that actually fit how you like to travel.',
  },
  {
    name: 'offer_ride',
    test: /\b(offer|post|list|give)\b.*\b(ride|journey|lift|seat)/i,
    reply: () => "I'll take you to the Offer a Journey page — enter your route, seats, and price and riders will be able to find and book you.",
    link: () => ({ href: '/offer', label: 'Offer a journey' }),
  },
  {
    name: 'journey_search',
    test: /\b(find|search|look(ing)? for|need|want|book)\b.*\b(ride|journey|lift|trip)\b|\bride (from|to)\b|\bany (rides?|journeys?) (to|from|available)/i,
    reply: (context) =>
      `Here's the search I'd run for "${context.query}" — tell me your pick-up, drop-off, and departure time and Genesis will match you against active offers with a full Decision DNA explanation.`,
    link: (context) => ({ href: `/find?q=${encodeURIComponent(context.query || '')}`, label: 'Open Find a Journey' }),
  },
];

export async function answerAssistantQuestion(env, message, context = {}) {
  const trimmed = (message || '').trim();
  if (!trimmed) {
    return { source: 'genesis', reply: "I didn't catch a question — try asking me about matching, bookings, payments, or safety." };
  }

  const intent = INTENTS.find((i) => i.test.test(trimmed));
  const intentContext = { ...context, query: trimmed };
  const deterministicReply = intent ? intent.reply(intentContext) : defaultReply();
  const link = intent?.link ? intent.link(intentContext) : undefined;

  if (isAnthropicConfigured(env)) {
    const contextNote = context.decisionDna ? `\n\nRelevant Decision DNA for this conversation: ${JSON.stringify(context.decisionDna)}` : '';
    const enriched = await askClaude(env, SYSTEM_PROMPT, `${trimmed}${contextNote}`);
    if (enriched) {
      return { source: 'anthropic', reply: enriched.trim(), intent: intent?.name || 'general', link };
    }
  }

  return { source: 'genesis-rules', reply: deterministicReply, intent: intent?.name || 'general', link };
}

function defaultReply() {
  return (
    "I'm still learning, but here's what I can help with today: how matching " +
    'and Decision DNA work, your booking status, payment options, ride ' +
    'preferences, and the Safety Centre. What would you like to know?'
  );
}
