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
COPY Dockerfile docker-entrypoint.sh compose.yaml stack-portainer.yml stack-portainer-ghcr-latest.yml ./
RUN npm run check

# Runtime image. The application has no npm runtime dependencies.
# A read-only seed copy lives in the image; the entrypoint synchronizes it to
# /var/lib/cay-gia-pha/app, which is bind-mounted from /opt/cay-gia-pha-web on
# the Ubuntu host by the supplied Stack.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    STORAGE_ROOT=/var/lib/cay-gia-pha \
    APP_DIR=/var/lib/cay-gia-pha/app \
    DATA_DIR=/var/lib/cay-gia-pha/data

WORKDIR /opt/cay-gia-pha-image/app
COPY --chown=node:node package.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node README.md NOTICE.md ./
COPY --chown=node:node docs ./docs

# Build ID is content-based, so rebuilding the same version with changed files
# still refreshes /opt/cay-gia-pha-web/app when the container starts.
RUN find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}' > .image-build-id \
    && chown node:node .image-build-id \
    && mkdir -p /var/lib/cay-gia-pha \
    && chown -R node:node /var/lib/cay-gia-pha

COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/cay-gia-pha-entrypoint
RUN chmod 0755 /usr/local/bin/cay-gia-pha-entrypoint

# Do not declare an anonymous Docker VOLUME here. Production Stack uses an
# explicit host bind mount: /opt/cay-gia-pha-web:/var/lib/cay-gia-pha.
USER node
WORKDIR /
EXPOSE 8787
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/cay-gia-pha-entrypoint"]
CMD ["node", "--no-warnings", "server.js"]
