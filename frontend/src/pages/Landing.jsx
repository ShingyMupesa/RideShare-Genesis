import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { trackEvent } from '../utils/attribution.js';
import { whatsAppShareUrl } from '../utils/whatsapp.js';

// Audience landing pages: /matatu, /taxi, /ride. Page-specific link
// previews for these URLs are injected server-side (worker/src/routes/
// landingMeta.js). Every claim here must stay true to what the app does
// today: 10% commission (5% on Pro), free to join, drivers set their
// fares, verified-driver badge, SOS safety centre, English + Swahili.

const CONTENT = {
  matatu: {
    en: {
      eyebrow: 'For matatu, PSV and shuttle drivers',
      headline: 'Fill your empty seats. Keep 90% of every fare.',
      body: 'Return trips and off-peak runs often leave seats empty. Post your route on Genesis and riders going your way book a seat ahead of time.',
      points: [
        ['💺', 'Fill empty seats', 'Post a trip in a minute: route, time, seats and your fare. Riders going the same way find you.'],
        ['💰', 'You keep 90%', 'Genesis takes 10%. With Pro Driver it is only 5%. No fee to join, no fee to post.'],
        ['✅', 'Get the verified badge', 'Upload your licence and insurance once. Verified drivers stand out to riders.'],
        ['🛡️', 'Safety built in', 'One-tap SOS, incident reports and a trusted contact on every trip.'],
      ],
      steps: ['Create a free account', 'Verify your licence and insurance', 'Post your route and seats', 'Riders book, you drive'],
      cta: 'Join free as a driver',
      ctaSecondary: 'Post a trip',
      share: 'Share with other drivers on WhatsApp',
      shareText: 'Matatu drivers: fill empty seats on Genesis and keep 90% of every fare. Free to join:',
      note: 'You must hold a valid driving licence (and PSV licence where required) and insurance for the vehicle you drive.',
    },
    sw: {
      eyebrow: 'Kwa madereva wa matatu, PSV na shuttle',
      headline: 'Jaza viti vilivyo wazi. Baki na 90% ya kila nauli.',
      body: 'Safari za kurudi na saa zisizo na abiria wengi huacha viti wazi. Weka njia yako kwenye Genesis na abiria wanaoelekea huko wahifadhi kiti mapema.',
      points: [
        ['💺', 'Jaza viti wazi', 'Weka safari kwa dakika moja: njia, saa, viti na nauli yako. Abiria wanaoenda njia hiyo wanakupata.'],
        ['💰', 'Unabaki na 90%', 'Genesis inachukua 10%. Ukiwa Pro Driver ni 5% tu. Hakuna ada ya kujiunga wala ya kuweka safari.'],
        ['✅', 'Pata beji ya kuthibitishwa', 'Pakia leseni na bima mara moja. Madereva waliothibitishwa wanaonekana zaidi kwa abiria.'],
        ['🛡️', 'Usalama ndani yake', 'SOS kwa mguso mmoja, ripoti za matukio na mtu wa kuaminika kwa kila safari.'],
      ],
      steps: ['Fungua akaunti bure', 'Thibitisha leseni na bima', 'Weka njia na viti', 'Abiria wanahifadhi, wewe unaendesha'],
      cta: 'Jiunge bure kama dereva',
      ctaSecondary: 'Weka safari',
      share: 'Shiriki na madereva wengine kwa WhatsApp',
      shareText: 'Madereva wa matatu: jazeni viti wazi kwenye Genesis na mbaki na 90% ya kila nauli. Kujiunga ni bure:',
      note: 'Lazima uwe na leseni halali ya kuendesha (na leseni ya PSV inapohitajika) na bima ya gari unaloendesha.',
    },
  },
  taxi: {
    en: {
      eyebrow: 'For airport and town taxi drivers',
      headline: 'Get booked before you reach the rank.',
      body: 'JKIA, Wilson, Moi International Mombasa, Kisumu, Eldoret and every town rank. Post your trips and riders going your way book you ahead, at the fare you set.',
      points: [
        ['✈️', 'Airport runs, pre-booked', 'Post your airport trips and return legs so you are not waiting empty at the rank.'],
        ['💰', 'Your fare, 90% to you', 'You set the price. Genesis takes 10%, or 5% with Pro Driver.'],
        ['✅', 'Verified-driver badge', 'Riders, tourists and business travellers look for verified drivers.'],
        ['💬', 'Message riders directly', 'Agree pickup points in the app before the trip, in English or Swahili.'],
      ],
      steps: ['Create a free account', 'Verify your licence and insurance', 'Post airport and town trips', 'Get bookings, keep 90%'],
      cta: 'Join free as a driver',
      ctaSecondary: 'Post a trip',
      share: 'Share with other taxi drivers on WhatsApp',
      shareText: 'Taxi drivers: get pre-booked airport and town rides on Genesis, set your own fare and keep 90%. Free to join:',
      note: 'You must hold a valid driving licence (and PSV licence where required) and insurance for the vehicle you drive. Follow airport and county rules for pickups.',
    },
    sw: {
      eyebrow: 'Kwa madereva wa teksi wa uwanja wa ndege na mjini',
      headline: 'Pata wateja kabla hujafika stendi.',
      body: 'JKIA, Wilson, Moi International Mombasa, Kisumu, Eldoret na kila stendi ya mji. Weka safari zako na abiria wanaoelekea huko wakuhifadhi mapema, kwa nauli unayoweka.',
      points: [
        ['✈️', 'Safari za uwanja wa ndege', 'Weka safari za uwanja na za kurudi ili usisubiri stendi bila mteja.'],
        ['💰', 'Nauli yako, 90% kwako', 'Wewe unaweka bei. Genesis inachukua 10%, au 5% ukiwa Pro Driver.'],
        ['✅', 'Beji ya dereva aliyethibitishwa', 'Abiria, watalii na wasafiri wa biashara hutafuta madereva waliothibitishwa.'],
        ['💬', 'Ongea na abiria moja kwa moja', 'Kubalianeni mahali pa kuchukuliwa kabla ya safari, kwa Kiingereza au Kiswahili.'],
      ],
      steps: ['Fungua akaunti bure', 'Thibitisha leseni na bima', 'Weka safari za uwanja na mjini', 'Pata wateja, baki na 90%'],
      cta: 'Jiunge bure kama dereva',
      ctaSecondary: 'Weka safari',
      share: 'Shiriki na madereva wa teksi kwa WhatsApp',
      shareText: 'Madereva wa teksi: pateni safari za uwanja wa ndege na mjini zilizohifadhiwa mapema kwenye Genesis, wekeni nauli yenu na mbaki na 90%. Ni bure:',
      note: 'Lazima uwe na leseni halali ya kuendesha (na leseni ya PSV inapohitajika) na bima ya gari. Fuata sheria za uwanja na kaunti kuhusu kuchukua abiria.',
    },
  },
  ride: {
    en: {
      eyebrow: 'For commuters and travellers',
      headline: 'Find a driver going your way.',
      body: 'Book a seat to work, upcountry or the airport. See the fare before you book, message your driver, and travel with one-tap SOS.',
      points: [
        ['🔍', 'See who is going your way', 'Genesis matches you with drivers on your route and explains why each match fits.'],
        ['💵', 'Fare shown up front', 'Every price is shown in shillings before you book. No surprises.'],
        ['✅', 'Look for the verified badge', 'Drivers who have had their licence and insurance checked carry a badge.'],
        ['🛡️', 'Safety Centre', 'One-tap SOS, incident reports and a trusted contact who can follow your trip.'],
      ],
      steps: ['Create a free account', 'Tell Genesis where you are going', 'Pick a driver and book a seat', 'Travel and rate your trip'],
      cta: 'Join free',
      ctaSecondary: 'Browse trips',
      share: 'Share with friends on WhatsApp',
      shareText: 'Find a driver going your way on Genesis. Fare shown up front, verified drivers and one-tap SOS. Free to join:',
      note: '',
    },
    sw: {
      eyebrow: 'Kwa wanaosafiri kila siku na wasafiri',
      headline: 'Pata dereva anayeelekea unakoenda.',
      body: 'Hifadhi kiti kwenda kazini, mashambani au uwanja wa ndege. Ona nauli kabla ya kuhifadhi, ongea na dereva, na usafiri ukiwa na SOS ya mguso mmoja.',
      points: [
        ['🔍', 'Ona nani anaenda njia yako', 'Genesis inakuunganisha na madereva wa njia yako na inaeleza kwa nini kila mmoja anafaa.'],
        ['💵', 'Nauli inaonekana mapema', 'Kila bei inaonyeshwa kwa shilingi kabla ya kuhifadhi. Hakuna mshangao.'],
        ['✅', 'Tafuta beji ya kuthibitishwa', 'Madereva ambao leseni na bima zao zimeangaliwa wana beji.'],
        ['🛡️', 'Kituo cha Usalama', 'SOS kwa mguso mmoja, ripoti za matukio na mtu wa kuaminika anayeweza kufuatilia safari yako.'],
      ],
      steps: ['Fungua akaunti bure', 'Iambie Genesis unakoenda', 'Chagua dereva na uhifadhi kiti', 'Safiri na tathmini safari'],
      cta: 'Jiunge bure',
      ctaSecondary: 'Angalia safari',
      share: 'Shiriki na marafiki kwa WhatsApp',
      shareText: 'Pata dereva anayeenda njia yako kwenye Genesis. Nauli inaonekana mapema, madereva waliothibitishwa na SOS. Ni bure:',
      note: '',
    },
  },
};

export default function Landing({ audience }) {
  const { lang, setLang } = useLanguage();
  const { user } = useAuth();
  const c = CONTENT[audience][lang] || CONTENT[audience].en;
  const isDriver = audience !== 'ride';
  const shareLink = `https://ridesharegenesis.app/${audience}?utm_source=whatsapp&utm_medium=share&utm_campaign=lp_${audience}`;

  useEffect(() => {
    trackEvent('page_view', `lp_${audience}`);
  }, [audience]);

  const primaryTo = user ? (isDriver ? '/offer' : '/find') : '/register';
  const secondaryTo = isDriver ? (user ? '/profile' : '/login') : '/browse';

  return (
    <div className="landing">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <button type="button" className={`btn btn-sm ${lang === 'en' ? 'btn-primary' : ''}`} onClick={() => setLang('en')}>
          English
        </button>
        <button type="button" className={`btn btn-sm ${lang === 'sw' ? 'btn-primary' : ''}`} onClick={() => setLang('sw')}>
          Kiswahili
        </button>
      </div>

      <section className="hero">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1>{c.headline}</h1>
        <p>{c.body}</p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to={primaryTo} className="btn btn-primary" onClick={() => trackEvent('cta_click', `lp_${audience}`, 'primary')}>
            {user ? c.ctaSecondary : c.cta}
          </Link>
          {!user && (
            <Link to={secondaryTo} className="btn btn-secondary" onClick={() => trackEvent('cta_click', `lp_${audience}`, 'secondary')}>
              {isDriver ? (lang === 'sw' ? 'Ingia' : 'Log in') : c.ctaSecondary}
            </Link>
          )}
        </div>
      </section>

      <section>
        <div className="principles-grid">
          {c.points.map(([icon, title, body]) => (
            <div className="principle-card" key={title}>
              <div className="icon">{icon}</div>
              <h3 style={{ margin: '8px 0 4px' }}>{title}</h3>
              <p className="muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: 32 }}>
        <p className="eyebrow">{lang === 'sw' ? 'Jinsi inavyofanya kazi' : 'How it works'}</p>
        <ol style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          {c.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {c.note && (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            {c.note}
          </p>
        )}
      </section>

      <section style={{ textAlign: 'center', margin: '32px 0' }}>
        <a
          className="btn btn-secondary"
          href={whatsAppShareUrl(`${c.shareText} ${shareLink}`)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent('cta_click', `lp_${audience}`, 'whatsapp_share')}
        >
          {c.share}
        </a>
        {isDriver && (
          <p className="muted" style={{ marginTop: 12, fontSize: '0.85rem' }}>
            {lang === 'sw'
              ? 'Leta dereva mwingine: akithibitishwa, unapata mwezi mmoja wa Pro Driver bure.'
              : 'Invite another driver: when they are verified, you get a free month of Pro Driver.'}{' '}
            <Link to={user ? '/profile' : '/register'}>{lang === 'sw' ? 'Pata kiungo chako' : 'Get your invite link'}</Link>
          </p>
        )}
      </section>
    </div>
  );
}
