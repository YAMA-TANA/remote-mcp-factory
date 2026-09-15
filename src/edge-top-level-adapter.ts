export const EDGE_TOP_LEVEL_ADAPTER_SCRIPT = String.raw`
import fs from 'node:fs';

const sourcePath = process.argv[2];
const outputPath = process.argv[3];
if (!sourcePath || !outputPath) throw new Error('usage: top-level-adapter <source> <output>');

let code = fs.readFileSync(sourcePath, 'utf8').replace(/^#!.*\n/, '');

function ensureHandlerImport(source) {
  if (/\bcreateMcpHandler\b/.test(source)) return source;
  let changed = false;
  source = source.replace(
    /import\s*\{([^}]*)\}\s*from\s*(['"])@modelcontextprotocol\/server\2\s*;?/,
    (_m, inside, quote) => {
      changed = true;
      const names = inside.split(',').map((v) => v.trim()).filter(Boolean);
      if (!names.includes('createMcpHandler')) names.push('createMcpHandler');
      return 'import { ' + names.join(', ') + ' } from ' + quote + '@modelcontextprotocol/server' + quote + ';';
    },
  );
  if (!changed) {
    source = "import { createMcpHandler } from '@modelcontextprotocol/server';\n" + source;
  }
  return source;
}

function stripStdioImport(source) {
  return source
    .split('\n')
    .filter((line) => !(
      /@modelcontextprotocol\/(?:server|sdk)\/server\/stdio/.test(line) ||
      /@modelcontextprotocol\/server\/stdio/.test(line)
    ))
    .join('\n');
}

function meaningfulTail(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
}

code = ensureHandlerImport(code);
code = stripStdioImport(code);

const serverDecl = /(?:^|\n)([ \t]*)(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:McpServer|Server)\s*\(/g;
const matches = [...code.matchAll(serverDecl)];
if (matches.length !== 1) {
  throw new Error('Top-level adapter requires exactly one McpServer/Server declaration; found ' + matches.length);
}

const match = matches[0];
const indent = match[1] || '';
const serverName = match[2];
const declStart = match.index + match[0].indexOf(indent);

// Accept either direct connect(new StdioServerTransport()) or the common
// transport variable followed by server.connect(transport) tail.
const escapedServer = serverName.replace(/[$]/g, '\\$&');
const directConnect = new RegExp(
  '(?:^|\\n)[ \\t]*(?:await\\s+)?' + escapedServer + '\\.connect\\s*\\(\\s*new\\s+StdioServerTransport\\s*\\([^;]*?\\)\\s*\\)\\s*;?',
  'm',
);
const connectViaVar = new RegExp(
  '(?:^|\\n)[ \\t]*(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+StdioServerTransport\\s*\\([^;]*?\\)\\s*;[\\s\\n]*(?:await\\s+)?' + escapedServer + '\\.connect\\s*\\(\\s*\\1\\s*\\)\\s*;?',
  'm',
);

let connect = directConnect.exec(code);
if (!connect) connect = connectViaVar.exec(code);
if (!connect || connect.index <= declStart) {
  throw new Error('Top-level adapter could not find the terminal stdio connect call');
}

const connectStart = connect.index + (connect[0].startsWith('\n') ? 1 : 0);
const connectEnd = connect.index + connect[0].length;
const prefix = code.slice(0, declStart);
const body = code.slice(declStart, connectStart);
const suffix = code.slice(connectEnd);

if (meaningfulTail(suffix)) {
  throw new Error('Top-level adapter refuses meaningful runtime code after stdio connect');
}
if (/^\s*export\s/m.test(body)) {
  throw new Error('Top-level adapter refuses exported declarations inside the server registration block');
}
if (/\bawait\b/.test(body)) {
  throw new Error('Top-level adapter refuses top-level await inside the server registration block');
}
if (/\b(?:process\.exit|setInterval|setTimeout)\s*\(/.test(body)) {
  throw new Error('Top-level adapter refuses process/timer side effects in the server registration block');
}

const wrapped = [
  prefix.trimEnd(),
  '',
  'export default createMcpHandler(() => {',
  body.trim().split('\n').map((line) => '  ' + line).join('\n'),
  '  return ' + serverName + ';',
  '});',
  '',
].join('\n');

fs.writeFileSync(outputPath, wrapped);
`;
