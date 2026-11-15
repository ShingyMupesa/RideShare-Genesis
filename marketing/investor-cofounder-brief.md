# RideShare Genesis: investor and co-founder information

Everything published about early-bird pre-seed investors and co-founders,
gathered from the live site (ridesharegenesis.app), the investor package
(`docs/investor-package/`), the pitch deck and the one-pager. Compiled
15 Nov 2026.

## 1. What's on ridesharegenesis.app (homepage, "#invest" section)

**English**
- Eyebrow: Early-bird pre-seed round · Co-founders wanted
- Headline: Back or build Kenya's ride-sharing platform for matatu and taxi drivers
- Body: Genesis is live in Kenya. We are inviting early-bird pre-seed investors and co-founders (technical, growth and operations) to join from the start. Talk to the founder directly.
- Buttons: "Email the founder" (founder@ridesharegenesis.app) and "WhatsApp" (+44 7449 494405)

**Kiswahili**
- Uwekezaji wa mapema (pre-seed) · Tunatafuta co-founders
- Wekeza au jenga nasi jukwaa la usafiri wa pamoja kwa madereva wa matatu na teksi
- Genesis iko hewani Kenya. Tunawakaribisha wawekezaji wa mapema wa pre-seed na co-founders (wa kiufundi, ukuaji na uendeshaji) kujiunga tangu mwanzo. Ongea na mwanzilishi moja kwa moja.

The same invitation is in the Facebook launch post (15 Nov) and the
launch-kit social post.

An earlier version (Oct 2026, never merged) said: "We're looking for a
technical co-founder and early-bird investors. Join us in scaling Genesis,
as a technical co-founder helping build what's next, or as a pre-seed
investor backing the Nairobi pilot." It linked to the pitch deck's
"Get in touch" section.

## 2. The ask (pitch deck and one-pager)

- **Raise:** $250,000 pre-seed, 12-month runway
- **Use of funds:**
  1. Real geocoding and maps to replace the current placeholder layer
  2. Driver ID verification: Tier 2 automated checks against licensing-authority data
  3. A licensed payment processor at production volume
  4. The first 5,000-rider Nairobi cohort (go-to-market, not product build)
- **Stage:** Nairobi pilot, pre-seed. Expansion (Kampala, Dar es Salaam, Kigali) is not funded by this round.

## 3. Market and unit economics (stated as illustrative planning figures)

| Measure | Figure |
|---|---|
| TAM: East African urban ride-hailing and carpooling | $750M / yr |
| SAM: Nairobi metro shared-ride spend | $150M / yr |
| SOM: Year-3 Nairobi pilot target GMV | $3M / yr |
| Average fare / take rate | KES 650 / 10% ≈ $0.50 revenue per ride |
| Year-3 target | ~5,700 monthly active riders (2% of SAM, ~8 rides per rider per month) |

Methodology given: Nairobi metro ~4.8M people → ~1.9M regular paid-ride
commuters → ~285K addressable (SAM basis) at ~$520 per rider per year,
scaled ~5x across comparable East African metros for TAM.

## 4. The pitch in short

- **Mission:** a human-centred mobility platform that helps people meet real mobility needs through shared journeys, intelligent assistance, trust infrastructure and measurable impact.
- **Problem:** ride matching is a black box; drivers face commission they can't audit; in informal markets such as Nairobi's matatu culture, trust is earned trip by trip.
- **Solution:** Decision DNA, a visible six-factor match score (route fit, timing, price, preferences, reliability, environmental fit) that riders can retune; driver document review; mobile-money-first payments; Safety Centre with SOS and an audit trail.
- **Why Nairobi:** mobile-money-native payments, an informal trust gap, KES-first product. Next markets: Kampala, Dar es Salaam, Kigali.
- **Open issues stated openly:** Kenyan business registration, carpooling vs e-hailing legal classification, and liability insurance beyond the driver's own policy are not yet resolved.

## 5. Contact routes in use

| Where | Contact |
|---|---|
| Homepage, one-pager | founder@ridesharegenesis.app, WhatsApp +44 7449 494405 |
| Pitch deck "Talk to the founder" | mailto:mupesashingy@gmail.com (older; should be founder@) |
| Pitch deck (live) | https://claude.ai/code/artifact/483c8e4d-d5b8-44e0-a01e-cc3f7b57a9eb |
| Files | `docs/investor-package/documents/` (Pitch Deck PDF, One-Pager PDF, Blueprint, Compliance Overview draft, Terms draft, demo video) |

## 6. Out of date: fix before sending to investors

These statements in the pitch deck and one-pager no longer match the live
product:

| Deck / one-pager says | Reality on 15 Nov 2026 |
|---|---|
| "Real M-Pesa & card payments live from day one" | M-Pesa is switched off (no live Safaricom keys). Cards run on a Stripe **test** key. No real money is collected yet. |
| Commission "held at 0% early-bird" | Commission is live at **10%** (5% for Pro Driver subscribers). |
| Pro Driver plans not mentioned | Live: KES 500/month and KES 5,000/year. |
| Driver documents "checked before a driver can post" | Verification exists but enforcement is switched off in production. |
| "38 automated tests" | 178 backend tests now. |
| Seeding "~500-user cohort" | 4 registered users and 0 bookings as of 7 Nov. |
| Investor contact mupesashingy@gmail.com | Use founder@ridesharegenesis.app (forwards to the same inbox). |

New since the deck that strengthens the story: referral programme with free
Pro months, matatu/taxi/rider landing pages in English and Kiswahili, QR
posters, Admin Team with role-based access, revenue dashboard, Facebook
Page launched, Google Business Profile created.
