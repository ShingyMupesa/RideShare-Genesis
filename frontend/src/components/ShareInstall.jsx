import { useEffect, useState } from 'react';

const SHARE_TEXT = 'Genesis — a human-centred ridesharing app that explains every match. Give it a try:';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function ShareInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [copied, setCopied] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      setInstallPrompt(e);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    if (isIos()) {
      setShowIosHint(true);
      return;
    }
  }

  async function handleShare() {
    const url = window.location.origin;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'RideShare Genesis', text: SHARE_TEXT, url });
      } catch {
        // user cancelled the native share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy this link to share Genesis:', url);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        {!installed && (installPrompt || isIos()) && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleInstall}>
            📲 Install app
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleShare}>
          🔗 {copied ? 'Link copied!' : 'Share Genesis'}
        </button>
      </div>
      {showIosHint && (
        <p className="muted" style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: 8 }}>
          On iPhone: tap the Share icon in Safari, then "Add to Home Screen".
        </p>
      )}
    </div>
  );
}
