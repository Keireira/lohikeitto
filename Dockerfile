# --- Build ---
FROM rust:1.93-bookworm AS builder

RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  libssl-dev \
  libpq-dev \
  pkg-config && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache dependencies separately from application code
COPY Cargo.toml Cargo.lock ./
COPY crates/shared/Cargo.toml crates/shared/Cargo.toml
COPY crates/api/Cargo.toml crates/api/Cargo.toml
COPY crates/admin/Cargo.toml crates/admin/Cargo.toml
RUN mkdir -p crates/shared/src crates/api/src crates/admin/src && \
    echo "pub fn dummy() {}" > crates/shared/src/lib.rs && \
    echo "fn main() {}" > crates/api/src/main.rs && \
    echo "fn main() {}" > crates/admin/src/main.rs
RUN cargo build --release && rm -rf crates

# Build the actual application
COPY . .
RUN touch crates/shared/src/lib.rs crates/api/src/main.rs crates/admin/src/main.rs
ENV SQLX_OFFLINE=true
RUN cargo build --release

# --- Runtime ---
FROM debian:bookworm-slim

RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  ca-certificates \
  libssl-dev \
  libpq5 \
  curl && \
  rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/lohikeitto /usr/bin/lohikeitto
COPY --from=builder /app/target/release/admin /usr/bin/admin
COPY --from=builder /app/migrations /migrations

EXPOSE 3000
CMD ["lohikeitto"]
