FROM node:24.18.0-bookworm-slim AS pages
WORKDIR /build/gui
COPY gui/package.json gui/pnpm-lock.yaml gui/pnpm-workspace.yaml ./
COPY gui/patches/ patches/
COPY gui/apps/www/package.json apps/www/package.json
RUN corepack pnpm --filter @bapx/www install --prod --frozen-lockfile --ignore-scripts
COPY gui/apps/www/ apps/www/
COPY gui/README.md README.md
COPY gui/apps/desktop/README.md apps/desktop/README.md
COPY gui/docs/configuration.md gui/docs/release-notes.md docs/
COPY core/docs/setup.md /build/core/docs/setup.md
RUN corepack pnpm build:web

FROM rust:bookworm AS core
WORKDIR /build
COPY core/ .
RUN cargo build --locked --release --bin cloudroom

FROM debian:bookworm-slim
ARG BAPX_WEB_REVISION
COPY --from=pages /build/gui/apps/www/dist /srv/bapx-web
COPY --from=core /build/target/release/cloudroom /usr/local/bin/cloudroom
ENV BAPX_WEB_ROOT=/srv/bapx-web BAPX_WEB_DATA=/var/lib/bapx-web BAPX_WEB_LISTEN=0.0.0.0:8080
ENV BAPX_WEB_REVISION=${BAPX_WEB_REVISION}
RUN install -d -m 0700 -o 10001 -g 10001 /var/lib/bapx-web /var/lib/bapx-sites
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/cloudroom", "serve-web"]
