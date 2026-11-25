import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

const MPESA_POLL_INTERVAL_MS = 3000;
const MPESA_POLL_TIMEOUT_MS = 90000;
const PERIOD_LABEL = { weekly: 'week', monthly: 'month', yearly: 'year' };

function money(currency, amount) {
  return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

export default function DriverPro() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [mine, setMine] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [method, setMethod] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [stripeConfig, setStripeConfig] = useState({ enabled: false, publishableKey: null });

  const cardMountRef = useRef(null);
  const cardElementRef = useRef(null);
  const stripeObjRef = useRef(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [plans, me, methods] = await Promise.all([api.proPlans(), api.proMe(), api.paymentMethods()]);
      setData(plans);
      setMine(me);
      if (methods.stripe?.enabled) setStripeConfig(methods.stripe);
      setSelectedPlanId((cur) => cur || plans.plans[0]?.id || '');
      setMethod((cur) => cur || (plans.checkout.mpesa ? 'mpesa' : plans.checkout.stripe ? 'card_stripe' : ''));
    } catch (err) {
      setError(err.message || 'Could not load plans');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => () => clearInterval(pollRef.current), []);

  useEffect(() => {
    if (method !== 'card_stripe' || !stripeConfig.enabled || !cardMountRef.current) return undefined;
    if (!window.Stripe) {
      setError('Stripe failed to load — check your connection and reload.');
      return undefined;
    }
    if (!stripeObjRef.current) stripeObjRef.current = window.Stripe(stripeConfig.publishableKey);
    const card = stripeObjRef.current.elements().create('card');
    card.mount(cardMountRef.current);
    cardElementRef.current = card;
    return () => {
      card.unmount();
      cardElementRef.current = null;
    };
  }, [method, stripeConfig]);

  function onPaid() {
    setNotice('Payment received — you are now a Pro Driver. Your lower commission applies to your next rides.');
    load();
  }

  async function payByCard() {
    if (!cardElementRef.current || !stripeObjRef.current) return;
    setBusy(true);
    setError('');
    try {
      const { paymentId, clientSecret } = await api.proStripeCheckout(selectedPlanId);
      const result = await stripeObjRef.current.confirmCardPayment(clientSecret, { payment_method: { card: cardElementRef.current } });
      if (result.error) {
        setError(result.error.message || 'Card payment failed');
        return;
      }
      const { payment } = await api.proStripeConfirm(paymentId);
      if (payment.status === 'CAPTURED') onPaid();
      else setError('Your card payment has not been confirmed yet. Refresh in a moment.');
    } catch (err) {
      setError(err.message || 'Payment failed');
    } finally {
      setBusy(false);
    }
  }

  async function payByMpesa() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { paymentId, customerMessage } = await api.proMpesaCheckout(selectedPlanId, phone);
      setNotice(`${customerMessage || 'Check your phone'} — enter your M-Pesa PIN to complete the payment.`);
      const startedAt = Date.now();
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (Date.now() - startedAt > MPESA_POLL_TIMEOUT_MS) {
          clearInterval(pollRef.current);
          setBusy(false);
          setNotice('');
          setError('We did not get a confirmation from M-Pesa in time. If you paid, refresh this page shortly.');
          return;
        }
        try {
          const { payment } = await api.proMpesaStatus(paymentId);
          if (payment.status === 'CAPTURED') {
            clearInterval(pollRef.current);
            setBusy(false);
            onPaid();
          } else if (payment.status === 'FAILED') {
            clearInterval(pollRef.current);
            setBusy(false);
            setNotice('');
            setError('M-Pesa payment was not completed — cancelled, timed out, or declined.');
          }
        } catch {
          // transient poll failure — try again on the next tick
        }
      }, MPESA_POLL_INTERVAL_MS);
    } catch (err) {
      setError(err.message || 'Could not start the M-Pesa payment');
      setNotice('');
      setBusy(false);
    }
  }

  if (!data) return error ? <div className="alert alert-error">{error}</div> : <p className="muted">Loading plans…</p>;

  const plan = data.plans.find((p) => p.id === selectedPlanId);
  const sub = mine?.subscription;
  const noCheckout = !data.checkout.stripe && !data.checkout.mpesa;

  return (
    <div className="page">
      <h1>Genesis Pro Driver</h1>
      <p className="muted">
        Genesis keeps {data.platformCommissionPct}% of each paid ride fare. Pro Drivers keep more of every fare they earn.
      </p>

      {sub && (
        <div className="alert alert-success">
          You're on <strong>{sub.planName}</strong>
          {sub.commissionRatePct != null && <> — paying {sub.commissionRatePct}% commission</>}
          {sub.endsAt ? <> until {new Date(sub.endsAt.replace(' ', 'T') + 'Z').toLocaleDateString()}</> : null}. Paying again
          extends your plan.
        </div>
      )}
      {notice && <div className="alert alert-success">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="method-grid" style={{ marginTop: 16 }}>
        {data.plans.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`method-card ${selectedPlanId === p.id ? 'selected' : ''}`}
            onClick={() => setSelectedPlanId(p.id)}
            style={{ textAlign: 'left' }}
          >
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: '1.3rem', margin: '6px 0' }}>
              {money(p.currency, p.priceAmount)} <span className="muted">/ {PERIOD_LABEL[p.billingPeriod] || p.billingPeriod}</span>
            </div>
            {p.description && <div className="muted">{p.description}</div>}
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {p.perks.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
          </button>
        ))}
        {!data.plans.length && <p className="muted">No plans are on offer right now.</p>}
      </div>

      {plan && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Pay for {plan.name}</h2>
          {noCheckout ? (
            <p className="muted">Online payment isn't available yet. Please check back soon.</p>
          ) : (
            <>
              <div className="method-grid">
                {data.checkout.mpesa && plan.currency === 'KES' && (
                  <button type="button" className={`method-card ${method === 'mpesa' ? 'selected' : ''}`} onClick={() => setMethod('mpesa')}>
                    M-Pesa
                  </button>
                )}
                {data.checkout.stripe && (
                  <button type="button" className={`method-card ${method === 'card_stripe' ? 'selected' : ''}`} onClick={() => setMethod('card_stripe')}>
                    Card
                  </button>
                )}
              </div>

              {method === 'mpesa' && (
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label htmlFor="proPhone">M-Pesa phone number</label>
                  <input id="proPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" />
                  <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={busy || !phone} onClick={payByMpesa}>
                    {busy ? 'Waiting for confirmation…' : `Pay ${money(plan.currency, plan.priceAmount)}`}
                  </button>
                </div>
              )}
              {method === 'card_stripe' && (
                <div style={{ marginTop: 12 }}>
                  <div ref={cardMountRef} className="card" style={{ padding: 12 }} />
                  <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={busy} onClick={payByCard}>
                    {busy ? 'Processing…' : `Pay ${money(plan.currency, plan.priceAmount)}`}
                  </button>
                </div>
              )}
            </>
          )}
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
            One-off payment for one {PERIOD_LABEL[plan.billingPeriod] || 'period'}. Nothing renews automatically. You pay again
            only if you want to extend.
          </p>
        </div>
      )}
    </div>
  );
}
