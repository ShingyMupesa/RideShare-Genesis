import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';

// Printable A4 poster with a QR code, for matatu stages, airport taxi
// ranks, bus stops and inside vehicles. /poster?for=ride|matatu|taxi
// &ref=CODE (a driver's own invite code) &place=jkia (tracked as the
// campaign so the admin dashboard shows which locations bring signups).
const COPY = {
  ride: {
    en: ['Need a ride?', 'Book a seat with a driver going your way. Fare shown up front. One-tap SOS.'],
    sw: ['Unahitaji usafiri?', 'Hifadhi kiti na dereva anayeenda njia yako. Nauli inaonekana mapema. SOS kwa mguso mmoja.'],
  },
  matatu: {
    en: ['Matatu drivers: fill your empty seats', 'Post your route, riders book ahead. Keep 90% of every fare. Free to join.'],
    sw: ['Madereva wa matatu: jazeni viti wazi', 'Weka njia yako, abiria wanahifadhi mapema. Baki na 90% ya nauli. Ni bure.'],
  },
  taxi: {
    en: ['Taxi drivers: get booked before you reach the rank', 'Airport and town trips, your fare, 90% to you. Free to join.'],
    sw: ['Madereva wa teksi: pateni wateja kabla ya stendi', 'Safari za uwanja wa ndege na mjini, nauli yako, 90% kwako. Ni bure.'],
  },
};

export default function Poster() {
  const [params] = useSearchParams();
  const audience = COPY[params.get('for')] ? params.get('for') : 'ride';
  const ref = (params.get('ref') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  const place = (params.get('place') || '').replace(/[^\w-]/g, '').slice(0, 40);
  const [qr, setQr] = useState('');

  const target = ref
    ? `https://ridesharegenesis.app/r/${ref}?to=${audience}&utm_source=poster&utm_medium=qr&utm_campaign=${place || 'driver_poster'}`
    : `https://ridesharegenesis.app/${audience}?utm_source=poster&utm_medium=qr&utm_campaign=${place || 'poster'}`;

  useEffect(() => {
    QRCode.toDataURL(target, { width: 640, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [target]);

  const [enTitle, enBody] = COPY[audience].en;
  const [swTitle, swBody] = COPY[audience].sw;

  return (
    <div className="poster-page">
      <div className="poster-actions no-print">
        <p className="muted">
          Print this page (A4) and put it up at a stage, rank or inside your vehicle. Add <code>&amp;place=jkia</code> (or any
          place name) to the address to see in the admin dashboard which locations bring signups.
        </p>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print poster
        </button>
      </div>
      <div className="poster">
        <img src="/brand-logo.png" alt="RideShare Genesis" width="88" height="88" />
        <h1>{enTitle}</h1>
        <p className="poster-body">{enBody}</p>
        <h2>{swTitle}</h2>
        <p className="poster-body">{swBody}</p>
        {qr && <img className="poster-qr" src={qr} alt="QR code to join RideShare Genesis" />}
        <p className="poster-scan">Scan to join free · Changanua ujiunge bure</p>
        <p className="poster-url">ridesharegenesis.app/{ref ? `r/${ref}` : audience}</p>
      </div>
    </div>
  );
}
