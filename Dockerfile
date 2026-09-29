# Egg Heist: one container runs the game server, which also serves the built game page.
FROM node:24-alpine

WORKDIR /app

# Install dependencies first so they're cached between code changes.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
RUN npm run build

# Production: no dev cheats; player saves go to /data (mount a persistent volume there).
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["npm", "start"]
