import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

const WELCOME = {
  role: 'bot',
  text: "Hi, I'm Genesis. Ask me how matching, Decision DNA, payments, or the Safety Centre work.",
};

export default function GenesisAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
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

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);

    try {
      const res = await api.askAssistant(text);
      setMessages((prev) => [...prev, { role: 'bot', text: res.reply, link: res.link }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: "Sorry, I couldn't reach Genesis right now — please try again shortly." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={rootRef}>
      {open && (
        <div className="assistant-panel" role="dialog" aria-label="Genesis assistant">
          <div className="assistant-panel__header">
            <span>Genesis Assistant</span>
            <button
              type="button"
              className="panel-close-btn"
              onClick={() => setOpen(false)}
              aria-label="Close Genesis assistant"
            >
              ✕
            </button>
          </div>
          <div className="assistant-panel__messages">
            {messages.map((m, i) => (
              <div key={i} className={`assistant-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                {m.text}
                {m.link && (
                  <div style={{ marginTop: 8 }}>
                    <Link
                      to={m.link.href}
                      className="pill pill-primary"
                      style={{ textDecoration: 'none' }}
                      onClick={() => setOpen(false)}
                    >
                      {m.link.label} →
                    </Link>
                  </div>
                )}
              </div>
            ))}
            {sending && <div className="assistant-msg bot">Thinking…</div>}
          </div>
          <form className="assistant-panel__input" onSubmit={send}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Genesis anything…"
              aria-label="Message Genesis"
            />
            <button className="btn btn-primary" type="submit" disabled={sending}>
              Send
            </button>
          </form>
        </div>
      )}
      <button
        className="assistant-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Genesis assistant' : 'Open Genesis assistant'}
      >
        {open ? '✕' : '✦'}
      </button>
    </div>
  );
}
