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
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -rf src

# Build the actual application
COPY . .
RUN touch src/main.rs
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
COPY --from=builder /app/migrations /migrations

EXPOSE 3000
CMD ["lohikeitto"]
