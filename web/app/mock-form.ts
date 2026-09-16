export type MockFormValues = {
  name: string;
  method: string;
  path: string;
  statusCode: string;
  contentType: string;
  body: string;
  enabled: boolean;
};

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

export function mockRequestBody(values: MockFormValues): Record<string, unknown> {
  const name = values.name.trim();
  if (!name || name.length > 120) throw new Error('Endpoint name must be 1–120 characters.');
  const method = values.method.toUpperCase();
  if (!METHODS.has(method)) throw new Error('Unsupported HTTP method.');
  const path = values.path.trim().replace(/^\/+|\/+$/g, '');
  if (path.length > 500 || (path && !/^[A-Za-z0-9._~/-]+$/.test(path))) throw new Error('Path must use URL-safe letters, numbers, /, -, _, . or ~ and be at most 500 characters.');
  const status = Number(values.statusCode);
  if (!values.statusCode.trim() || !Number.isInteger(status) || status < 200 || status > 599) throw new Error('Status code must be an integer between 200 and 599.');
  const contentType = values.contentType.trim();
  if (!contentType || contentType.length > 255 || /[\r\n]/.test(contentType)) throw new Error('Enter a valid response content type.');
  if (values.body.length > 256 * 1024) throw new Error('Response body exceeds the 256 KiB limit.');
  if ((method === 'HEAD' || NULL_BODY_STATUSES.has(status)) && values.body.trim()) throw new Error('HEAD, 204, 205 and 304 responses cannot include a body. Clear the response body first.');
  return { name, method, path, statusCode: status, contentType, body: values.body, enabled: values.enabled };
}
