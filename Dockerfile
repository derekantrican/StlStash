# --- Build the client ---
FROM node:20-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Install server dependencies ---
FROM node:20-slim AS server-deps
WORKDIR /app/server
# better-sqlite3 is a native module. Prebuilt binaries cover most platforms, but this stays
# as a source-build fallback for architectures (e.g. some ARM boards) without one.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci --omit=dev

# --- Runtime image ---
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV DATA_DIR=/data

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

VOLUME /data
EXPOSE 4000

CMD ["node", "server/index.js"]
