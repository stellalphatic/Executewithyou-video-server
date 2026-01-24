# ALLSTRM Stream Service Dockerfile
FROM rust:1.92-slim-bookworm as builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./
COPY services/ services/

RUN cargo build --release -p allstrm-stream

# Runtime image
FROM debian:bookworm-slim

# Install FFmpeg for transcoding
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/allstrm-stream /usr/local/bin/

# HTTP API and RTMP ports
EXPOSE 8083
EXPOSE 1935

# HLS output directory
RUN mkdir -p /tmp/allstrm/hls

CMD ["allstrm-stream"]
