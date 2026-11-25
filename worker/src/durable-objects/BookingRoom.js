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
    // In-memory only — safe because each DO instance is addressed via
    // idFromName(bookingId), so it's already scoped to a single booking.
    // Throttles D1 writes from a 'location:ping' frame to once per 15s;
    // the broadcast to the other participant still happens on every ping.
    this.lastPersistedAt = 0;
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

        // No role-gating here — a passenger pinging their own location is
        // harmless and only ever visible within their own booking's room,
        // same as a message:send frame above.
        if (data.type === 'location:ping' && typeof data.lat === 'number' && typeof data.lng === 'number') {
          this.broadcast({ type: 'location:update', lat: data.lat, lng: data.lng, heading: data.heading ?? null, at: new Date().toISOString() });
          const now = Date.now();
          if (now - (this.lastPersistedAt || 0) >= 15000) {
            this.lastPersistedAt = now;
            await this.env.DB.prepare(
              `INSERT INTO live_locations (booking_id, lat, lng, heading, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(booking_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, heading=excluded.heading, updated_at=CURRENT_TIMESTAMP`
            ).bind(bookingId, data.lat, data.lng, data.heading ?? null).run();
          }
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
