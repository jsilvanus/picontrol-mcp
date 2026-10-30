import { defaultPseudonymizer } from './pseudonymize.js';

const SECRET_KEY = /(pass(word)?|token|secret|api_?key|stream_?key|authorization|mediamtxpassword)/i;

/** Masks the last path segment of an RTMP(S)/RTSP URL, which is usually a stream key. */
function maskUrl(value: string): string {
  return value.replace(/^((?:rtmps?|rtsp):\/\/[^/]+\/.*\/)([^/?#]+)/i, '$1***');
}

/**
 * Checks if a value appears to be a raw binary buffer or massive base64 image/audio payload.
 * Enforces the strict "Never image or sound" policy for cloud AI safety.
 */
function isMediaPayload(key: string, value: unknown): boolean {
  if (Buffer.isBuffer(value)) return true;
  if (/^(thumbnail|image|photo|frame|audio|audioData|pcm|wave|jpeg|png)$/i.test(key)) {
    if (typeof value === 'string' && (value.startsWith('data:image/') || value.length > 500)) {
      return true;
    }
  }
  return false;
}

/** Deep copy with secrets masked, PII names pseudonymized, and raw media stripped. */
export function redact<T>(value: T, pseudonymize = true): T {
  if (typeof value === 'string') {
    let masked = maskUrl(value);
    if (pseudonymize) {
      masked = defaultPseudonymizer.outbound(masked);
    }
    return masked as unknown as T;
  }
  if (Array.isArray(value)) return value.map(entry => redact(entry, pseudonymize)) as unknown as T;
  if (value && typeof value === 'object') {
    if (Buffer.isBuffer(value)) {
      return '[Binary media stripped]' as unknown as T;
    }
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (SECRET_KEY.test(key) && entry !== null && entry !== undefined && typeof entry !== 'boolean' && typeof entry !== 'number') {
        return [key, '***'];
      }
      if (isMediaPayload(key, entry)) {
        return [key, '[Media payload suppressed: zero image/sound to cloud]'];
      }
      return [key, redact(entry, pseudonymize)];
    });
    return Object.fromEntries(entries) as T;
  }
  return value;
}
