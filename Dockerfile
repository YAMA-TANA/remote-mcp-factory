FROM docker.io/cloudflare/sandbox:0.12.9

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git curl ca-certificates python3 python3-pip python3-venv build-essential \
    ffmpeg jq \
  && rm -rf /var/lib/apt/lists/*

# Sandbox fallback runtime plus the edge compiler's workerd/Wrangler smoke-test toolchain.
RUN npm install -g mcp-proxy@6.7.16 pnpm@latest wrangler@4.131.2

USER sandbox
EXPOSE 8080
