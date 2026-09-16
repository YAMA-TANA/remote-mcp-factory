// Deliberately bounded MIME subset: common multipart/alternative, multipart/mixed,
// base64, quoted-printable and RFC 2047 subjects. Unsupported/oversize parts are omitted.
const MAX_PARTS = 16;
const MAX_DEPTH = 4;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 256 * 1024;
const MAX_TEXT_CHARS = 64 * 1024;

export type ParsedAttachment = { filename: string; contentType: string; data: Uint8Array };
export type ParsedMail = { text: string | null; html: string | null; attachments: ParsedAttachment[]; omittedAttachments: number };

function headerMap(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of value.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    if (/^[a-z0-9-]{1,80}$/.test(key)) result[key] = line.slice(colon + 1).trim();
  }
  return result;
}

function decodeBytes(value: Uint8Array, charset: string): string {
  try { return new TextDecoder(charset || 'utf-8', { fatal: false }).decode(value); }
  catch { return new TextDecoder('utf-8', { fatal: false }).decode(value); }
}

function base64Bytes(value: string): Uint8Array | null {
  try {
    const decoded = atob(value.replace(/[\r\n\t ]/g, ''));
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  } catch { return null; }
}

function quotedPrintableBytes(value: string): Uint8Array {
  const joined = value.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    if (joined[i] === '=' && /^[0-9a-f]{2}$/i.test(joined.slice(i + 1, i + 3))) {
      out.push(parseInt(joined.slice(i + 1, i + 3), 16)); i += 2;
    } else if (joined.charCodeAt(i) <= 127) out.push(joined.charCodeAt(i));
    else out.push(...new TextEncoder().encode(joined[i]));
  }
  return new Uint8Array(out);
}

function decodedPart(value: string, encoding: string): Uint8Array | null {
  if (encoding === 'base64') return base64Bytes(value);
  if (encoding === 'quoted-printable') return quotedPrintableBytes(value);
  return new TextEncoder().encode(value);
}

export function decodeMimeHeader(value: string): string {
  return value.replace(/=\?([^?\s]+)\?([bq])\?([^?]*)\?=/gi, (whole, charset: string, encoding: string, encoded: string) => {
    const bytes = encoding.toLowerCase() === 'b'
      ? base64Bytes(encoded)
      : quotedPrintableBytes(encoded.replace(/_/g, ' '));
    return bytes ? decodeBytes(bytes, charset) : whole;
  }).replace(/(\?=)\s+(=\?)/g, '$1$2');
}

function parameter(value: string, name: string): string | null {
  const extended = value.match(new RegExp(`(?:^|;)\\s*${name}\\*\\s*=\\s*(?:"([^"]*)"|([^;]*))`, 'i'));
  if (extended) {
    const raw = (extended[1] ?? extended[2] ?? '').trim();
    try { return decodeURIComponent(raw.replace(/^[^']*'[^']*'/, '')); } catch { return null; }
  }
  const plain = value.match(new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;]*))`, 'i'));
  return plain ? decodeMimeHeader((plain[1] ?? plain[2] ?? '').trim()) : null;
}

function safeFilename(value: string): string {
  const cleaned = value.replace(/[\\/\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '').trim();
  return cleaned.slice(0, 120) || 'attachment.bin';
}

export function parseMimeMessage(raw: Uint8Array): ParsedMail {
  const result: ParsedMail = { text: null, html: null, attachments: [], omittedAttachments: 0 };
  let remainingParts = MAX_PARTS;
  const input = new TextDecoder('utf-8', { fatal: false }).decode(raw).replace(/\r\n/g, '\n');

  function visit(inputPart: string, depth: number): void {
    if (--remainingParts < 0 || depth > MAX_DEPTH) { result.omittedAttachments++; return; }
    const boundary = inputPart.indexOf('\n\n');
    if (boundary < 0) return;
    const headers = headerMap(inputPart.slice(0, boundary));
    const body = inputPart.slice(boundary + 2);
    const contentType = (headers['content-type'] || 'text/plain').toLowerCase();
    if (contentType.startsWith('multipart/')) {
      const delimiter = parameter(headers['content-type'] || '', 'boundary');
      if (!delimiter || delimiter.length > 120 || /[\r\n]/.test(delimiter)) return;
      const sections = body.split(`--${delimiter}`);
      for (const section of sections.slice(1)) {
        if (section.startsWith('--')) break;
        visit(section.replace(/^\n/, '').replace(/\n$/, ''), depth + 1);
      }
      return;
    }
    const bytes = decodedPart(body.replace(/\n$/, ''), (headers['content-transfer-encoding'] || '').toLowerCase());
    if (!bytes) { result.omittedAttachments++; return; }
    const disposition = headers['content-disposition'] || '';
    const filename = parameter(disposition, 'filename') || parameter(headers['content-type'] || '', 'name');
    const baseType = contentType.split(';')[0].trim();
    const isAttachment = Boolean(filename) || /\battachment\b/i.test(disposition) || (baseType !== 'text/plain' && baseType !== 'text/html');
    if (isAttachment) {
      if (result.attachments.length >= MAX_ATTACHMENTS || bytes.byteLength > MAX_ATTACHMENT_BYTES) { result.omittedAttachments++; return; }
      result.attachments.push({ filename: safeFilename(filename || 'attachment.bin'), contentType: baseType.slice(0, 120) || 'application/octet-stream', data: bytes });
      return;
    }
    const charset = parameter(headers['content-type'] || '', 'charset') || 'utf-8';
    const decoded = decodeBytes(bytes, charset).slice(0, MAX_TEXT_CHARS);
    if (baseType === 'text/html') result.html = result.html === null ? decoded : (result.html + '\n' + decoded).slice(0, MAX_TEXT_CHARS);
    else result.text = result.text === null ? decoded : (result.text + '\n' + decoded).slice(0, MAX_TEXT_CHARS);
  }
  visit(input, 0);
  return result;
}
