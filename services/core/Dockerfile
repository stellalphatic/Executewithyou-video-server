# ALLSTRM Core Service Dockerfile
FROM rust:1.92-slim-bookworm as builder

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy entire workspace
COPY Cargo.toml ./
COPY services/ services/
COPY migrations/ migrations/

# Build the core service
RUN cargo build --release -p allstrm-core

# Runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/allstrm-core /usr/local/bin/
COPY migrations ./migrations

EXPOSE 8081

CMD ["allstrm-core"]
