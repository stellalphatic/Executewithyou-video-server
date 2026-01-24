# ALLSTRM Storage Service Dockerfile
FROM rust:1.92-slim-bookworm as builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./
COPY services/ services/
COPY migrations/ migrations/

RUN cargo build --release -p allstrm-storage

# Runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/allstrm-storage /usr/local/bin/

EXPOSE 8084

CMD ["allstrm-storage"]
