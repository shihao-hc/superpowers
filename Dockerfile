FROM node:20-alpine

LABEL maintainer="UltraWork AI"
LABEL description="UltraWork AI Agent Platform"

WORKDIR /app

RUN apk add --no-cache \
    dumb-init \
    curl \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV PUPPETEER_NO_SANDBOX=true

EXPOSE 3000

USER node

RUN mkdir -p /app/.opencode /app/data /app/screenshots && \
    chown -R node:node /app/.opencode /app/data /app/screenshots

VOLUME ["/app/.opencode", "/app/data", "/app/screenshots"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/index.js"]
