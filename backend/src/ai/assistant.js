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
    test: /decision dna|why (was|did) i (get )?match(ed)?|how (does|do) (the )?matching (algorithm |engine )?work|match (score|explanation)/i,
    reply: () =>
      'Every match is scored transparently across six factors — proximity, timing, price fit, preference alignment, driver reliability, and environmental fit — using weights you can tune in your profile\'s Decision DNA settings. Open any match card and tap "Why this match?" to see the exact breakdown behind the score.',
  },
  {
    name: 'booking_workflow',
    test: /booking status|how (does|do) booking work|confirm(ed)? (my )?(ride|booking)|cancel (a |my )?(booking|ride|trip|journey)/i,
    reply: () =>
      'Bookings move through REQUESTED → MATCHED → BOOKING_REQUESTED → CONFIRMED → IN_PROGRESS → COMPLETED, and can be cancelled from any step before COMPLETED — seats release automatically. If you posted the journey yourself (an offer or a request), open its Journey Details page and use the Cancel button there instead. Check "My Journeys" for the live status of everything.',
  },
  {
    name: 'payments',
    test: /payment|pay(ing)?|refund|card|mobile money|cash|\bcost\b|\bprice\b|currency|\bkes\b|shilling|commission|platform fee|take a cut/i,
    reply: () =>
      'You can pay by card, mobile money, wallet balance, or arrange cash directly with your driver — pick whichever suits you at checkout. Every price is shown in the currency its owner actually chose, never assumed. Genesis currently takes 0% commission during the early-bird period; whatever rate applies is fixed at the moment of payment, so it never changes retroactively.',
  },
  {
    name: 'safety',
    test: /safety|sos|emergency|unsafe|report (a )?(driver|passenger|incident)|driver (never|didn'?t|did not) show|no.?show|driver('s)? late|driver cancelled/i,
    reply: () =>
      'Your safety comes first. The Safety Centre has a one-tap SOS that logs an incident instantly and can alert your trusted contact, plus a form to report any concern — including a driver who never showed — after a trip. You can find it from the main menu at any time.',
  },
  {
    name: 'preferences',
    test: /preference|chatty|quiet|music|smok(e|ing|er)|pets/i,
    reply: () =>
      'Set your ride preferences (chattiness, music, smoking, pets, luggage) in your Profile. Genesis uses them, alongside your Decision DNA weights, to prioritise matches that actually fit how you like to travel.',
  },
  {
    name: 'messaging',
    test: /\bmessage\b|\bchat\b|\btext\b (my |the )?(driver|passenger|rider)|contact (my |the )?(driver|passenger|rider)/i,
    reply: () =>
      'Every booking has its own message thread — open the booking from "My Journeys" and tap Message to chat with your driver or passenger in real time.',
  },
  {
    name: 'account_password',
    test: /\bpassword\b/i,
    reply: () =>
      'Use "Forgot password?" on the login page — it emails you a reset link. You can also show or hide what you\'re typing with the eye icon on any password field.',
    link: () => ({ href: '/forgot-password', label: 'Reset your password' }),
  },
  {
    name: 'install_app',
    test: /\binstall\b|add to home screen|\bpwa\b/i,
    reply: () =>
      'Tap the "📲 Install app" button on the home page — on Android or desktop it adds Genesis straight to your home screen or app list; on iPhone, open the Share icon in Safari and choose "Add to Home Screen".',
    link: () => ({ href: '/', label: 'Go to the home page' }),
  },
  {
    name: 'feedback',
    test: /\bfeedback\b|\bsuggestion\b|\bcomplain/i,
    reply: () => "There's a feedback button in the bottom corner of every page — no login needed. We read every one.",
  },
  {
    name: 'contact_support',
    test: /contact (support|you|us|someone)|talk to (a )?human|customer service|reach (the team|support)|\bwhatsapp\b/i,
    reply: () =>
      "You can message us directly on WhatsApp — the link's in the footer of every page — or use the feedback button for anything non-urgent.",
  },
  {
    name: 'browse',
    test: /\bbrowse\b|see (all |available )?(rides|journeys|offers)/i,
    reply: () =>
      "The Browse page lists every active offered and requested journey — handy if you're free to drive and want to see who needs a ride right now.",
    link: () => ({ href: '/browse', label: 'Open Browse' }),
  },
  {
    name: 'data_safety',
    test: /is my data safe|\bprivacy\b|data protection/i,
    reply: () =>
      "Passwords are hashed, never stored in plain text; sensitive actions are logged in an audit trail; and an optional AI assistant only ever sees your own Decision DNA weights, never your bookings or payments. We're not a fully licensed operator yet — see the Compliance Overview for exactly what's built versus still roadmap.",
  },
  {
    name: 'not_yet_delete_account',
    test: /delete (my )?account|close (my )?account|remove (my )?account/i,
    reply: () =>
      "Account deletion isn't self-service yet. Message us on WhatsApp (link in the footer) or use the feedback button and we'll take care of it directly.",
  },
  {
    name: 'not_yet_wallet',
    test: /wallet transfer|send money to (a |the )?(driver|passenger)|transfer (money|funds)|internal transfer/i,
    reply: () =>
      "That's not built yet — there's no in-app wallet or peer-to-peer transfer system for refunds or disputes right now. It's on the roadmap; for now, disputes go through the Safety Centre.",
  },
  {
    name: 'not_yet_verification',
    test: /verified driver|driver verification|background check|licen[cs]e check/i,
    reply: () =>
      "Driver identity, licence, and vehicle verification isn't built yet — it's a near-term roadmap item before any public launch. Right now the platform doesn't independently confirm a driver's licence or insurance.",
  },
  {
    name: 'not_yet_rating',
    test: /\brating\b|rate (my |the )?driver|\bstars?\b|review (my |the )?driver/i,
    reply: () =>
      "There's no user-submitted star rating yet — but every match already factors in a real reliability score computed from a driver's actual completed-trip history on Genesis, visible in every match's Decision DNA breakdown.",
  },
  {
    name: 'share_app',
    test: /\bshare\b|\binvite\b|\breferral\b|\btell (a )?friend/i,
    reply: () =>
      'There\'s a "🔗 Share Genesis" button right on the home page — tap it and it opens your phone\'s share sheet (or copies a link if sharing isn\'t supported) so you can send the app straight to a friend.',
    link: () => ({ href: '/', label: 'Go to the home page' }),
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

export async function answerAssistantQuestion(message, context = {}) {
  const trimmed = (message || '').trim();
  if (!trimmed) {
    return { source: 'genesis', reply: "I didn't catch a question — try asking me about matching, bookings, payments, or safety." };
  }

  const intent = INTENTS.find((i) => i.test.test(trimmed));
  const intentContext = { ...context, query: trimmed };
  const deterministicReply = intent ? intent.reply(intentContext) : defaultReply();
  const link = intent?.link ? intent.link(intentContext) : undefined;

  if (isAnthropicConfigured()) {
    const contextNote = context.decisionDna
      ? `\n\nRelevant Decision DNA for this conversation: ${JSON.stringify(context.decisionDna)}`
      : '';
    const enriched = await askClaude(SYSTEM_PROMPT, `${trimmed}${contextNote}`);
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
