FROM docker.io/cloudflare/sandbox:0.12.9

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates python3 python3-pip python3-venv build-essential \
  && rm -rf /var/lib/apt/lists/*

# Translate stdio MCP servers into Streamable HTTP at /mcp.
RUN npm install -g mcp-proxy@6.7.16 pnpm@latest

USER sandbox
EXPOSE 8080
