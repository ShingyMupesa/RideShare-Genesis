# Build context is the repository root (see docker-compose.yml), because the
# backend needs the sibling `database/` directory for its migrations.
FROM node:20-bookworm-slim AS base
WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev

COPY backend/src ./src
COPY database ../database

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_FILE=/app/data/rideshare-genesis.sqlite

EXPOSE 4000
CMD ["node", "src/server.js"]
