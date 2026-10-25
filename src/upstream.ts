import { Client as PimatrixClient, ApiError as PimatrixApiError } from './generated/pimatrix/index.js';
import { Client as PivoiceClient, ApiError as PivoiceApiError } from './generated/pivoice/index.js';
import type { Config } from './config.js';

export interface Upstreams {
  pimatrix?: PimatrixClient;
  pivoice?: PivoiceClient;
}

export type UpstreamName = keyof Upstreams;

/** One generated client per upstream. The upstream secret only ever lives inside the client's config. */
export function createUpstreams(config: Pick<Config, 'pimatrix' | 'pivoice'>): Upstreams {
  return {
    ...(config.pimatrix ? { pimatrix: new PimatrixClient({ BASE: config.pimatrix.url, ...(config.pimatrix.secret ? { TOKEN: config.pimatrix.secret } : {}) }) } : {}),
    ...(config.pivoice ? { pivoice: new PivoiceClient({ BASE: config.pivoice.url, ...(config.pivoice.secret ? { TOKEN: config.pivoice.secret } : {}) }) } : {}),
  };
}

/** A readable one-line error that never carries request headers or upstream URLs with keys. */
export function describeError(error: unknown): string {
  if (error instanceof PimatrixApiError || error instanceof PivoiceApiError) {
    const body = error.body as { error?: { message?: string } | string; message?: string } | undefined;
    const detail = typeof body?.error === 'string' ? body.error : body?.error?.message ?? body?.message;
    return `Upstream answered ${error.status} ${error.statusText}${detail ? ': ' + detail : ''}`;
  }
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ? `${error.message} (${cause.code})` : error.message;
  }
  return String(error);
}
