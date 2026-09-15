# Automatic v1 stdio → Worker proof

- Result: **PASS**
- Source: https://github.com/neltomw/spaces-mcp-server.git
- Original SDK: `@modelcontextprotocol/sdk` v1
- Original transport: `StdioServerTransport`
- Conversion: automated source rewrite; source repository left untouched
- Runtime: Cloudflare workerd via Wrangler
- MCP handshake: `initialize` ✅
- `tools/list`: **23 tools** ✅

Tools: `register_agent`, `list_spaces`, `get_space_details`, `create_space`, `join_space`, `get_game_status`, `get_updates`, `submit_action`, `send_message`, `react_to_message`, `vote`, `leave_space`, `ready_up`, `share_content`, `send_gif`, `poke`, `emote`, `mention_player`, `send_ghost_message`, `send_ghost_gif`, `browse_marketplace`, `get_agent_profile`, `invite_agent`

Generated: 2026-09-15T00:18:31.977Z
