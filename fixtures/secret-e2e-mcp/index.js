import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const secret = process.env.FACTORY_E2E_SECRET;
if (!secret) throw new Error('FACTORY_E2E_SECRET is required before MCP startup');

function tag(value) {
  if (value === 'moon-rabbit-secret-v1') return 'v1';
  if (value === 'moon-rabbit-secret-v2') return 'v2';
  return 'unexpected';
}

const server = new McpServer({ name: 'factory-secret-e2e', version: '1.0.0' });

server.tool(
  'secret_status',
  'Return non-sensitive proof that the deployment secret reached the MCP runtime.',
  {},
  async () => {
    const current = process.env.FACTORY_E2E_SECRET || '';
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          present: Boolean(current),
          tag: tag(current),
          length: current.length,
        }),
      }],
    };
  },
);

await server.connect(new StdioServerTransport());
