import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { getSocket } from '../services/socket.js';

export default function BookingThread() {
  const { id } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    api
      .listMessages(id)
      .then((res) => setMessages(res.messages))
      .catch((err) => setError(err.message || 'Could not load messages'));

    const socket = getSocket(id);
    if (!socket) return undefined;

    socket.emit('booking:join', id);
    const handler = (msg) => {
      if (msg.booking_id === id) setMessages((prev) => [...prev, msg]);
    };
    socket.on('message:new', handler);
    return () => socket.off('message:new', handler);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    setInput('');
    const socket = getSocket(id);
    if (socket) {
      socket.emit('message:send', { bookingId: id, body });
    } else {
      try {
        const { message } = await api.sendMessage(id, body);
        setMessages((prev) => [...prev, message]);
      } catch (err) {
        setError(err.message || 'Could not send message');
      }
    }
  }

  return (
    <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
      <p className="eyebrow">
        <Link to={`/bookings/${id}`}>← Back to booking</Link>
      </p>
      <h1>Conversation</h1>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="message-thread">
        {messages.map((m) => (
          <div key={m.id} className={`message-bubble ${m.sender_id === user?.id ? 'mine' : 'theirs'}`}>
            {m.body}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
