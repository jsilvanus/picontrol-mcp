const SECRET_KEY = /(pass(word)?|token|secret|api_?key|stream_?key|authorization|mediamtxpassword)/i;

/** Masks the last path segment of an RTMP(S)/RTSP URL, which is usually a stream key. */
function maskUrl(value: string): string {
  return value.replace(/^((?:rtmps?|rtsp):\/\/[^/]+\/.*\/)([^/?#]+)/i, '$1***');
}

/** Deep copy with secrets masked. Applied to every tool result, resource and audit entry. */
export function redact<T>(value: T): T {
  if (typeof value === 'string') return maskUrl(value) as T;
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SECRET_KEY.test(key) && entry !== null && entry !== undefined && typeof entry !== 'boolean' && typeof entry !== 'number' ? '***' : redact(entry),
      ]),
    ) as T;
  }
  return value;
}
