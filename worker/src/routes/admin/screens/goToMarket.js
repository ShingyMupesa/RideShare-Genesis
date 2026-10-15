// Go-to-market screen: pure static markup, no backend, no fetch — honest
// Genesis roadmap copy, consistent with docs/investor-package's stated
// plan (Nairobi pilot now; Kampala/Dar es Salaam/Kigali as Year-3-earned
// next steps, not funded by this round). Labelled clearly as roadmap/plan,
// not committed fact.

export function markup() {
  return `
  <div class="screen" id="screen-goToMarket">
    <h2 style="font-size:1rem;">Go-to-market</h2>
    <p class="muted" style="margin-bottom:16px;">
      This is a roadmap and plan, not a committed fact or a forecast guarantee — it describes current stage and
      near-term intent, consistent with the language used in the investor package (docs/investor-package/).
    </p>

    <section style="margin-top:0;">
      <h3 style="font-size:0.9rem;">Where Genesis stands today</h3>
      <p>
        Genesis is in <strong>pre-launch pilot</strong> — live in Nairobi with a handful of early real users, priced
        in Kenyan shillings, built around mobile money (M-Pesa) as a first-class payment method. Every number
        anywhere else in this admin panel reflects that real, early stage: small, genuine counts, not inflated ones.
      </p>
    </section>

    <section>
      <h3 style="font-size:0.9rem;">Near-term plan</h3>
      <ul>
        <li>Grow real usage within Nairobi — the current pilot cohort — before anything else.</li>
        <li>Prove the carpooling + Decision DNA matching model holds up against real trip volume, not just a demo.</li>
        <li>Replace manually entered coordinates with real geocoding and live maps.</li>
        <li>Bring driver identity verification and a licensed payment processor online behind the existing provider contract.</li>
      </ul>
    </section>

    <section>
      <h3 style="font-size:0.9rem;">Where next (earned, not funded by this round)</h3>
      <p class="muted" style="margin-bottom:8px;">
        Expansion isn't funded by the current round — it's what a Nairobi pilot that hits its Year-3 target earns the
        right to attempt next, per the investor package's stated roadmap. The candidates aren't arbitrary: each
        shares Nairobi's informal transit-trust gap and a comparable mobile-money rail the existing payments layer
        already fits with the least rework.
      </p>
      <ul>
        <li><strong>Kampala, Uganda</strong> — MTN/Airtel Mobile Money penetration comparable to M-Pesa's.</li>
        <li><strong>Dar es Salaam, Tanzania</strong> — its own shilling currency and an STK-style mobile-money-majority population.</li>
        <li><strong>Kigali, Rwanda</strong> — the next East African metro candidate under the same criteria.</li>
      </ul>
    </section>

    <section>
      <h3 style="font-size:0.9rem;">What this deliberately does not claim</h3>
      <ul>
        <li>No committed launch dates for any city beyond Nairobi.</li>
        <li>No promised user or revenue targets beyond what the pilot has actually reached (see Dashboard, Analytics, UX Metrics for real, current numbers).</li>
        <li>No implication of traffic or scale this app does not yet have.</li>
      </ul>
    </section>
  </div>`;
}

export function script() {
  // Static screen — nothing to fetch, nothing to wire up.
  return '';
}
