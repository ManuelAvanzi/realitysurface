# REALITYSURFACE — immagine per hosting (Fly.io, Railway, Render, VPS con Docker).
# Debian "slim" e non Alpine: better-sqlite3 e canvas (dipendenza di mind-ar) hanno i binari precompilati per glibc.
FROM node:20-bookworm-slim

# Librerie di sistema usate dal binario precompilato di canvas (generazione delle demo lato server).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .

# Dati persistenti (database + upload) su un disco montato in /data.
ENV PORT=8080 DATA_DIR=/data UPLOADS_DIR=/data/uploads
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
