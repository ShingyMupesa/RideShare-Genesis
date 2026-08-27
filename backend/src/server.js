import 'dotenv/config';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';
import { attachSocket } from './messaging/socket.js';

runMigrations();

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*' },
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'change-me-in-production');
    socket.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

app.set('io', io);
attachSocket(io);

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`RideShare Genesis backend listening on port ${port}`);
});
