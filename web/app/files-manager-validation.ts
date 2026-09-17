/** Match the public Files runtime's conservative path restrictions. */
export function validFilePath(path: string): boolean {
  return path.length > 0 && path.length <= 512 && !path.startsWith('/') && !path.includes('..')
    && !path.includes('\\') && !/[\x00-\x1f]/.test(path);
}

export function validExpirySeconds(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 900;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function fileUrl(origin: string, publicId: string, path: string): string | null {
  if (!/^[a-f0-9]{32}$/i.test(publicId) || !validFilePath(path)) return null;
  try {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return `${url.origin}/files/${publicId}/${path.split('/').map(encodeURIComponent).join('/')}`;
  } catch { return null; }
}
