FROM rust:1.85-bookworm AS builder

RUN apt-get update && apt-get install -y libssl-dev libpq-dev pkg-config && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 libpq5 curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/lohikeitto /usr/local/bin/lohikeitto
COPY --from=builder /app/migrations /app/migrations

WORKDIR /app
EXPOSE 3000

CMD ["lohikeitto"]
