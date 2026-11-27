FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
ARG SOURCE_SHA
LABEL org.opencontainers.image.revision=$SOURCE_SHA
WORKDIR /app
COPY starters/app-admin/package.json starters/app-admin/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && install -d -m 0700 -o node -g node /private
COPY starters/app-admin/ ./
USER node
CMD ["node", "server.mjs"]
