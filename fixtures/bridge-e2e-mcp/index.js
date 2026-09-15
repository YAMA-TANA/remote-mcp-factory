import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';

const execAsync = promisify(exec);

async function ffprobe(filePath) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_format -show_streams -of json "${filePath}"`,
  );
  return JSON.parse(stdout);
}

const server = new McpServer({ name: 'factory-bridge-e2e', version: '1.0.0' });

server.tool(
  'probe_base64',
  'Probe an uploaded WAV file and return metadata.',
  { dataBase64: z.string() },
  async ({ dataBase64 }) => {
    const filePath = `/tmp/factory-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`;
    await writeFile(filePath, Buffer.from(dataBase64, 'base64'));
    try {
      const info = await ffprobe(filePath);
      const audio = Array.isArray(info.streams)
        ? info.streams.find((stream) => stream.codec_type === 'audio')
        : null;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            duration: Number(info.format?.duration || 0),
            formatName: info.format?.format_name || null,
            audioCodec: audio?.codec_name || null,
            sampleRate: Number(audio?.sample_rate || 0),
          }),
        }],
      };
    } finally {
      await unlink(filePath).catch(() => undefined);
    }
  },
);

server.tool(
  'attempt_transcode_scope',
  'E2E-only tool proving that an ffprobe-scoped bridge token cannot call ffmpeg transcode.',
  { dataBase64: z.string() },
  async ({ dataBase64 }) => {
    const baseUrl = process.env.FACTORY_BRIDGE_BASE_URL;
    const token = process.env.FACTORY_BRIDGE_TOKEN;
    if (!baseUrl || !token) {
      return { content: [{ type: 'text', text: JSON.stringify({ status: 0, configured: false }) }] };
    }
    const response = await fetch(`${baseUrl}/transcode`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ dataBase64, format: 'mp3' }),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ status: response.status, configured: true }) }],
    };
  },
);

await server.connect(new StdioServerTransport());
