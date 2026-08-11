# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-bookworm-slim

# Run the project's regression suite while building the image.
FROM ${NODE_IMAGE} AS verify
WORKDIR /src
COPY package.json ./
COPY server.js windows-launcher.js ./
COPY lib ./lib
COPY public ./public
COPY tests ./tests
RUN npm run check

# Small runtime image. The application has no npm runtime dependencies.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/var/lib/cay-gia-pha/data

WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node README.md NOTICE.md ./
COPY --chown=node:node docs ./docs

# Mount the PARENT storage directory, not /app/data directly. Backup/restore swaps
# the data subdirectory atomically, so its parent must stay on the same filesystem.
RUN mkdir -p /var/lib/cay-gia-pha/data/uploads \
    && chown -R node:node /var/lib/cay-gia-pha /app

USER node
EXPOSE 8787
VOLUME ["/var/lib/cay-gia-pha"]
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "--no-warnings", "server.js"]
