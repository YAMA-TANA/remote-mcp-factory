FROM docker.io/cloudflare/sandbox:0.12.9

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv ffmpeg jq \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# The base Sandbox image already includes git, curl, certificates, Node.js, and Bun.
# Keep only the long-lived proxy in the image. Wrangler remains lazy: this tiny shim
# preserves existing compiler commands while fetching the pinned CLI only when needed.
RUN npm install -g --no-audit --no-fund mcp-proxy@6.7.16 \
  && npm cache clean --force \
  && printf '#!/bin/sh\nexec npx --yes wrangler@4.131.2 "$@"\n' > /usr/local/bin/wrangler \
  && chmod +x /usr/local/bin/wrangler

USER sandbox
EXPOSE 8080
