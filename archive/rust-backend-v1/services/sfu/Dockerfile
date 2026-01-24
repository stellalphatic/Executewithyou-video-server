# ALLSTRM SFU Service Dockerfile
FROM rust:1.92-slim-bookworm as builder

WORKDIR /app

# Install dependencies for WebRTC
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    cmake \
    clang \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./
COPY services/ services/

RUN cargo build --release -p allstrm-sfu

# Runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/allstrm-sfu /usr/local/bin/

# WebRTC ports
EXPOSE 8082
EXPOSE 10000-10100/udp

CMD ["allstrm-sfu"]
