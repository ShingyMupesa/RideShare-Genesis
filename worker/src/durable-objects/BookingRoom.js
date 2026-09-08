import { createMessage } from '../routes/messaging.js';

// One Durable Object instance per booking (addressed via idFromName(bookingId)).
// Holds the set of live WebSocket connections for that booking's chat and
// fans out new messages to them. Message persistence still goes through D1
// (env.DB), so REST reads/writes and the WebSocket both see the same data.
export class BookingRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const payload = await request.json();
      this.broadcast(payload);
      return new Response('ok');
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const userId = url.searchParams.get('userId');
    const bookingId = url.searchParams.get('bookingId');
    if (!userId || !bookingId) return new Response('Missing userId/bookingId', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sessions.add(server);

    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message:send' && typeof data.body === 'string' && data.body.trim()) {
          const message = await createMessage(this.env.DB, { bookingId, senderId: userId, body: data.body.trim() });
          this.broadcast({ type: 'message:new', message });
        }
      } catch {
        // ignore malformed client frames
      }
    });

    const cleanup = () => this.sessions.delete(server);
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(payload) {
    const text = JSON.stringify(payload);
    for (const ws of this.sessions) {
      try {
        ws.send(text);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }
}
