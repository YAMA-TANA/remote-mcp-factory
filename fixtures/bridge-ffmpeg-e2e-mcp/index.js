import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, unlink } from 'node:fs/promises';

const execAsync = promisify(exec);

async function ffmpeg(inputPath, outputPath) {
  await execAsync(
    `ffmpeg -hide_banner -loglevel error -nostdin -y -i "${inputPath}" -vn -c:a libmp3lame -b:a 96k "${outputPath}"`,
  );
}

const server = new McpServer({ name: 'factory-bridge-ffmpeg-e2e', version: '1.0.0' });

server.tool(
  'transcode_base64',
  'Transcode an uploaded WAV file to MP3 and return the bytes.',
  { dataBase64: z.string() },
  async ({ dataBase64 }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const inputPath = `/tmp/factory-ffmpeg-${suffix}.wav`;
    const outputPath = `/tmp/factory-ffmpeg-${suffix}.mp3`;
    await writeFile(inputPath, Buffer.from(dataBase64, 'base64'));
    try {
      await ffmpeg(inputPath, outputPath);
      const output = await readFile(outputPath);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            mimeType: 'audio/mpeg',
            bytes: output.byteLength,
            dataBase64: Buffer.from(output).toString('base64'),
          }),
        }],
      };
    } finally {
      await unlink(inputPath).catch(() => undefined);
      await unlink(outputPath).catch(() => undefined);
    }
  },
);

server.tool(
  'attempt_probe_scope',
  'E2E-only tool proving that an ffmpeg-scoped bridge token cannot call ffprobe.',
  { dataBase64: z.string() },
  async ({ dataBase64 }) => {
    const baseUrl = process.env.FACTORY_BRIDGE_BASE_URL;
    const token = process.env.FACTORY_BRIDGE_TOKEN;
    if (!baseUrl || !token) {
      return { content: [{ type: 'text', text: JSON.stringify({ status: 0, configured: false }) }] };
    }
    const response = await fetch(`${baseUrl}/probe`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ dataBase64 }),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ status: response.status, configured: true }) }],
    };
  },
);

await server.connect(new StdioServerTransport());
