FROM node:24.18.0-bookworm-slim AS pages
WORKDIR /build
COPY gui/apps/www/ .
RUN node src/build.ts

FROM rust:bookworm AS core
WORKDIR /build
COPY core/ .
RUN cargo build --locked --release --bin cloudroom

FROM debian:bookworm-slim
ARG BAPX_WEB_REVISION
COPY --from=pages /build/dist /srv/bapx-web
COPY --from=core /build/target/release/cloudroom /usr/local/bin/cloudroom
ENV BAPX_WEB_ROOT=/srv/bapx-web BAPX_WEB_DATA=/var/lib/bapx-web BAPX_WEB_LISTEN=0.0.0.0:8080
ENV BAPX_WEB_REVISION=${BAPX_WEB_REVISION}
RUN install -d -m 0700 -o 10001 -g 10001 /var/lib/bapx-web
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/cloudroom", "serve-web"]
