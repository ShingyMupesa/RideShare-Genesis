import { io } from 'socket.io-client';
import { getToken } from './api.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

let socket = null;

export function getSocket() {
  const token = getToken();
  if (!token) return null;

  if (!socket) {
    socket = io(SOCKET_URL, { auth: { token }, autoConnect: false });
  } else {
    socket.auth = { token };
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
