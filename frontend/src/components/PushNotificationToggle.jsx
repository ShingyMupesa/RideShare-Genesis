import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

const SUPPORTED = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

function urlBase64ToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushNotificationToggle() {
  const [status, setStatus] = useState('checking'); // checking | unavailable | off | on | busy
  const [error, setError] = useState('');

  useEffect(() => {
    if (!SUPPORTED) {
      setStatus('unavailable');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? 'on' : 'off'))
      .catch(() => setStatus('unavailable'));
  }, []);

  async function enable() {
    setError('');
    setStatus('busy');
    try {
      if (Notification.permission === 'denied') {
        throw new Error('Notifications are blocked for this site in your browser settings.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('off');
        return;
      }
      const { publicKey, enabled } = await api.getVapidPublicKey();
      if (!enabled || !publicKey) {
        throw new Error('Push notifications are not configured on the server yet.');
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await api.subscribePush({ endpoint: json.endpoint, keys: json.keys });
      setStatus('on');
    } catch (err) {
      setError(err.message || 'Could not enable notifications');
      setStatus('off');
    }
  }

  async function disable() {
    setError('');
    setStatus('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.unsubscribePush(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      setStatus('off');
    } catch (err) {
      setError(err.message || 'Could not disable notifications');
      setStatus('on');
    }
  }

  if (status === 'unavailable') {
    return <p className="muted" style={{ fontSize: '0.8rem' }}>Push notifications aren't supported in this browser.</p>;
  }

  return (
    <div className="form-field">
      <label>
        <input
          type="checkbox"
          checked={status === 'on'}
          disabled={status === 'checking' || status === 'busy'}
          onChange={(e) => (e.target.checked ? enable() : disable())}
        />{' '}
        Notify me about new matches, messages and booking updates
      </label>
      {error && <p className="alert alert-error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
