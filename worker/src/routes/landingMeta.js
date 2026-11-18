import { Hono } from 'hono';

// The site is a single-page app, so every URL normally gets the same
// index.html <head>. Link-preview bots (WhatsApp, Facebook, X, Telegram)
// don't run JavaScript, so campaign pages would all preview identically.
// These routes serve the same SPA shell with page-specific title,
// description, canonical URL and preview image injected server-side.
export const landingMeta = new Hono();

const ORIGIN = 'https://ridesharegenesis.app';

export const LANDINGS = {
  '/matatu': {
    title: 'Matatu & PSV drivers: fill empty seats, keep 90% | RideShare Genesis',
    description:
      'Fill empty seats on return trips and off-peak runs. Riders book and pay ahead, you keep 90% of every fare (95% on Pro). Free to join, with a verified-driver badge once your documents are checked.',
    image: '/og/og-matatu.jpg',
  },
  '/taxi': {
    title: 'Airport & town taxi drivers: get bookings before you arrive | RideShare Genesis',
    description:
      'JKIA, Wilson, Moi International, Kisumu and town ranks. Get pre-booked riders going your way, set your own fare and keep 90% (95% on Pro). Free to join.',
    image: '/og/og-taxi.jpg',
  },
  '/ride': {
    title: 'Find a driver going your way | RideShare Genesis',
    description:
      'Book a seat with a verified driver across Kenya. See the fare up front, message your driver, and travel with one-tap SOS. Free to join, in English and Swahili.',
    image: '/og/og-ride.jpg',
  },
  // Plain content pages listed in sitemap.xml. Without their own canonical
  // they inherit index.html's canonical of "/", which tells Google they are
  // duplicates of the home page, so Search Console reports them as
  // "Alternate page with proper canonical tag" and never indexes them.
  '/browse': {
    title: 'Browse rides available right now | RideShare Genesis',
    description:
      'See the seats and ride requests open across Kenya right now. Book a seat with a verified driver, or offer the empty seats on a trip you are already making.',
    image: '/og/og-ride.jpg',
  },
  '/trust': {
    title: 'Trust & Safety: how RideShare Genesis keeps rides safe | RideShare Genesis',
    description:
      'How driver verification works, what the verified badge means, how payments and your data are protected, and how to report a concern.',
    image: '/og/og-default.jpg',
  },
  '/terms': {
    title: 'Terms & Conditions | RideShare Genesis',
    description: 'The terms for riders and drivers using RideShare Genesis, the ride-sharing marketplace for Kenya.',
    image: '/og/og-default.jpg',
  },
  '/privacy': {
    title: 'Privacy Policy | RideShare Genesis',
    description: 'What personal data RideShare Genesis collects, why, how long it is kept, and how to see or delete it.',
    image: '/og/og-default.jpg',
  },
  referral: {
    title: 'You have been invited to RideShare Genesis',
    description: 'Join free with this invite. Drivers keep 90% of every fare; riders find verified drivers going their way across Kenya.',
    image: '/og/og-default.jpg',
  },
};

function setContent(selector, value) {
  return [selector, { element: (el) => el.setAttribute('content', value) }];
}

async function serve(c, meta, canonicalPath) {
  const shell = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url), { headers: c.req.raw.headers }));
  const url = `${ORIGIN}${canonicalPath}`;
  const image = `${ORIGIN}${meta.image}`;
  const handlers = [
    ['title', { element: (el) => el.setInnerContent(meta.title) }],
    setContent('meta[name="description"]', meta.description),
    setContent('meta[property="og:title"]', meta.title),
    setContent('meta[property="og:description"]', meta.description),
    setContent('meta[property="og:url"]', url),
    setContent('meta[property="og:image"]', image),
    setContent('meta[name="twitter:title"]', meta.title),
    setContent('meta[name="twitter:description"]', meta.description),
    setContent('meta[name="twitter:image"]', image),
    ['link[rel="canonical"]', { element: (el) => el.setAttribute('href', url) }],
  ];
  let rewriter = new HTMLRewriter();
  for (const [sel, h] of handlers) rewriter = rewriter.on(sel, h);
  const res = rewriter.transform(shell);
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  return new Response(res.body, { status: 200, headers });
}

for (const path of ['/matatu', '/taxi', '/ride', '/browse', '/trust', '/terms', '/privacy']) {
  landingMeta.get(path, (c) => serve(c, LANDINGS[path], path));
}
// Referral links: never canonicalise to the personal code.
landingMeta.get('/r/:code', (c) => serve(c, LANDINGS.referral, '/'));
