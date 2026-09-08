import { io } from 'socket.io-client';
import { getToken } from './api.js';

// Two real-time transports share this module's public interface
// (getSocket(bookingId), .emit, .on, .off, disconnectSocket) so
// BookingThread.jsx doesn't need to know which backend it's talking to:
//
// - socket.io-client, for the reference Node/Express + Socket.IO backend
//   (local dev, Docker).
// - a native WebSocket adapter, for the Cloudflare Workers + Durable
//   Objects deployment, which has no Socket.IO server.
//
// Set VITE_WS_MODE=native at build time to select the native adapter.

const NATIVE_MODE = import.meta.env.VITE_WS_MODE === 'native';

let socket = null;
let currentBookingId = null;

function getSocketIO() {
  const token = getToken();
  if (!token) return null;

  const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

  if (!socket) {
    socket = io(SOCKET_URL, { auth: { token }, autoConnect: false });
  } else {
    socket.auth = { token };
  }
  if (!socket.connected) socket.connect();
  return socket;
}

function nativeWsUrl(bookingId, token) {
  const base = import.meta.env.VITE_WS_URL || `${window.location.origin.replace(/^http/, 'ws')}`;
  return `${base}/ws/booking/${bookingId}?token=${encodeURIComponent(token)}`;
}

/** Minimal EventEmitter + socket.io-like `.emit` over a raw WebSocket. */
function createNativeSocket(bookingId) {
  const token = getToken();
  if (!token) return null;

  const listeners = new Map();
  const ws = new WebSocket(nativeWsUrl(bookingId, token));

  ws.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    for (const cb of listeners.get(payload.type) || []) cb(payload.message ?? payload);
  });

  return {
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
    },
    off(event, cb) {
      listeners.get(event)?.delete(cb);
    },
    emit(event, payload) {
      if (event === 'booking:join') return; // already scoped to this booking via the WS URL
      if (event === 'message:send' && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message:send', body: payload.body }));
      }
    },
    _ws: ws,
  };
}

export function getSocket(bookingId) {
  if (NATIVE_MODE) {
    if (socket && currentBookingId !== bookingId) {
      socket._ws.close();
      socket = null;
    }
    if (!socket) {
      socket = createNativeSocket(bookingId);
      currentBookingId = bookingId;
    }
    return socket;
  }
  return getSocketIO();
}

export function disconnectSocket() {
  if (!socket) return;
  if (NATIVE_MODE) socket._ws.close();
  else socket.disconnect();
  socket = null;
  currentBookingId = null;
}
