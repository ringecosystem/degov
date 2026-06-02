FROM rust:1.95-bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY apps/indexer/Cargo.toml apps/indexer/Cargo.toml
COPY apps/indexer/src apps/indexer/src
COPY apps/indexer/schema apps/indexer/schema

RUN cargo build -p degov-datalens-indexer --locked --release

FROM debian:bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/degov-datalens-indexer /usr/local/bin/degov-datalens-indexer

USER nobody:nogroup

ENTRYPOINT [ "degov-datalens-indexer" ]
