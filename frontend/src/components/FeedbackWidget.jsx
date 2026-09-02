import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

export default function FeedbackWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.sendFeedback({
        message: message.trim(),
        email: email.trim() || undefined,
        page: window.location.pathname,
      });
      setSent(true);
      setMessage('');
      setEmail('');
    } catch (err) {
      setError(err.message || 'Could not send feedback');
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={rootRef}>
      {open && (
        <div className="feedback-panel" role="dialog" aria-label="Send feedback">
          <div className="feedback-panel__header">
            <span>Feedback</span>
            <button
              type="button"
              className="panel-close-btn"
              onClick={() => setOpen(false)}
              aria-label="Close feedback"
            >
              ✕
            </button>
          </div>
          <div className="feedback-panel__body">
            {sent ? (
              <p className="muted">Thanks — we read every one of these.</p>
            ) : (
              <form onSubmit={handleSubmit}>
                <textarea
                  rows={3}
                  placeholder="What's working, what's not, what would you change?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
                {!user && (
                  <input
                    type="email"
                    placeholder="Email (optional, if you'd like a reply)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
                {error && <p className="feedback-panel__error">{error}</p>}
                <button className="btn btn-primary btn-sm" type="submit" disabled={sending}>
                  {sending ? 'Sending…' : 'Send feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      <button
        className="feedback-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close feedback' : 'Send feedback'}
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  );
}
