import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { whatsAppShareUrl } from '../utils/whatsapp.js';

// Personal invite link + QR poster. Reward: one free month of Pro Driver
// for each invited person who becomes a verified driver (paid
// automatically on approval, see worker/src/lib/referrals.js).
export default function InviteCard() {
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.myReferrals().then(setInfo).catch(() => setInfo(null));
  }, []);

  if (!info) return null;
  const driverLink = `${info.link}?to=matatu`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the link is visible to copy by hand
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h3>Invite drivers and riders</h3>
      <p className="muted">
        Every driver you invite who gets verified earns you <strong>one free month of Pro Driver</strong> (5% commission
        instead of 10%). Riders you invite help fill your seats.
      </p>
      <p>
        Your link: <code>{info.link}</code>{' '}
        <button type="button" className="btn btn-sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </p>
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        {info.invited} joined with your link · {info.verifiedDrivers} verified driver{info.verifiedDrivers === 1 ? '' : 's'} ·{' '}
        {info.freeMonthsEarned} free month{info.freeMonthsEarned === 1 ? '' : 's'} earned
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a
          className="btn btn-secondary"
          href={whatsAppShareUrl(`Join me on Genesis. Drivers keep 90% of every fare and riders find drivers going their way. Free to join: ${driverLink}`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Invite drivers on WhatsApp
        </a>
        <a
          className="btn btn-secondary"
          href={whatsAppShareUrl(`Need a ride? Book a seat with me on Genesis: ${info.link}`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Invite riders on WhatsApp
        </a>
        <Link className="btn" to={`/poster?for=ride&ref=${info.code}`} target="_blank">
          Print my QR poster for my vehicle
        </Link>
      </div>
    </div>
  );
}
