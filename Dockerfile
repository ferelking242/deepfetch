FROM node:22-slim AS base
RUN apt-get update && apt-get install -y \
    chromium \
    python3 \
    pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install zeusdl (from pip or local — adjust as needed)
# RUN pip3 install zeusdl

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# ── Build server ──────────────────────────────────────────────────────────────
FROM base AS server-builder
COPY server/package*.json ./server/
RUN cd server && npm ci
COPY server/ ./server/
RUN cd server && npm run build

# ── Build dashboard ───────────────────────────────────────────────────────────
FROM base AS dashboard-builder
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci
COPY dashboard/ ./dashboard/
RUN cd dashboard && npm run build

# ── Final image ───────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
RUN apt-get update && apt-get install -y chromium python3 pip curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/src/db/schema.sql ./server/dist/db/schema.sql
COPY --from=dashboard-builder /app/dashboard/dist ./dashboard/dist

RUN cd server && npm ci --omit=dev

# Install Playwright Chromium
RUN cd server && npx playwright install chromium --with-deps

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "server/dist/index.js"]
