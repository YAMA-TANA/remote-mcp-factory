export type CaptureFormat = 'png' | 'pdf';

/** A request URL is never a safe filename: its path and query may contain private data. */
export function resultFilename(prefix: 'fetch' | 'capture', source: string, extension: 'md' | 'json' | CaptureFormat): string {
  let host = 'result';
  try { host = new URL(source).hostname.toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/^\.+|\.+$/g, '').slice(0, 56) || 'result'; }
  catch { /* Keep the generic name for malformed source URLs. */ }
  return `picosvc-${prefix}-${host}.${extension}`;
}

export function validatePublicInput(raw: string): string | null {
  try {
    const url = new URL(raw);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname && !url.username && !url.password && !url.hash ? url.toString() : null;
  } catch { return null; }
}

export function captureResponseFormat(contentType: string): CaptureFormat | null {
  const type = contentType.split(';', 1)[0].trim().toLowerCase();
  return type === 'image/png' ? 'png' : type === 'application/pdf' ? 'pdf' : null;
}

/** Shell-escape a single-quoted argument, including apostrophes in URL paths. */
export function shellQuote(value: string): string { return `'${value.replace(/'/g, `'\\''`)}'`; }

export function shotExamples(endpoint: string, target: string, format: CaptureFormat, fullPage: boolean) {
  const url = validatePublicInput(target) || 'https://example.com/';
  const body = { url, format, fullPage: format === 'png' && fullPage, waitUntil: 'networkidle2', waitMs: 900 };
  const curl = [
    `curl --fail-with-body -sS -X POST ${shellQuote(endpoint)}`,
    '  -H "Authorization: Bearer $PICOSVC_SHOT_API_KEY"',
    "  -H 'Content-Type: application/json'",
    `  --data ${shellQuote(JSON.stringify(body))}`,
    `  --output capture.${format}`,
  ].join(' \\\n');
  const javascript = [
    `const response = await fetch(${JSON.stringify(endpoint)}, {`,
    "  method: 'POST',",
    '  headers: {',
    '    Authorization: `Bearer ${process.env.PICOSVC_SHOT_API_KEY}`,',
    "    'Content-Type': 'application/json',",
    '  },',
    `  body: JSON.stringify(${JSON.stringify(body)}),`,
    '});',
    'if (!response.ok) throw new Error(await response.text());',
    'const bytes = await response.arrayBuffer(); // Save or upload the PNG/PDF',
  ].join('\n');
  return { curl, javascript };
}

/** Browser download; nothing is retained on the server or in local storage. */
export function downloadTextResult(content: string, mime: string, filename: string): void {
  const objectUrl = URL.createObjectURL(new Blob([content], { type: mime }));
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }
}
