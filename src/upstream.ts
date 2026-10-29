import { Client as PimatrixClient, ApiError as PimatrixApiError } from './generated/pimatrix/index.js';
import { Client as PivoiceClient, ApiError as PivoiceApiError } from './generated/pivoice/index.js';
import type { Config } from './config.js';

export class PitubeClient {
  constructor(readonly options: { BASE: string; TOKEN?: string }) {}
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const url = `${this.options.BASE.replace(/\/+$/, '')}${path}`;
    const headers: Record<string, string> = {};
    if (this.options.TOKEN) headers['Authorization'] = `Bearer ${this.options.TOKEN}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      let detail = `pitube answered ${res.status}`;
      try {
        const j = await res.json() as Record<string, unknown>;
        if (j?.error) detail = typeof j.error === 'string' ? j.error : (j.error as Record<string, unknown>).message as string || detail;
      } catch {}
      throw Object.assign(new Error(detail), { status: res.status });
    }
    return (await res.json()) as T;
  }
  getStatus() { return this.request('/api/v1/status'); }
  listBroadcasts() { return this.request<{ selectedId: string | null; items: unknown[] }>('/api/v1/broadcasts'); }
  selectBroadcast(broadcastId: string) { return this.request('/api/v1/broadcasts/select', 'POST', { broadcastId }); }
  createBroadcast(input: { title: string; privacy?: string | undefined; description?: string | undefined; scheduledStartTime?: string | undefined }) {
    return this.request('/api/v1/broadcasts/create', 'POST', input);
  }
  startBroadcast() { return this.request('/api/v1/broadcasts/start', 'POST'); }
  stopBroadcast() { return this.request('/api/v1/broadcasts/stop', 'POST'); }
}

export class PilightClient {
  constructor(readonly options: { BASE: string; TOKEN?: string }) {}
  async request<T>(path: string = '', method = 'GET', body?: unknown): Promise<T> {
    const url = `${this.options.BASE.replace(/\/+$/, '')}${path}`;
    const headers: Record<string, string> = {};
    if (this.options.TOKEN) headers['Authorization'] = `Bearer ${this.options.TOKEN}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      let detail = `pilight answered ${res.status}`;
      try {
        const j = await res.json() as Record<string, unknown>;
        if (j?.error) detail = typeof j.error === 'string' ? j.error : (j.error as Record<string, unknown>).message as string || detail;
      } catch {}
      throw Object.assign(new Error(detail), { status: res.status });
    }
    return (await res.json()) as T;
  }
  listLights() { return this.request<unknown[]>('/api/v1/lights'); }
  getLight(id: string) { return this.request(`/api/v1/lights/${encodeURIComponent(id)}`); }
  setState(id: string, mode: string) { return this.request(`/api/v1/lights/${encodeURIComponent(id)}/state`, 'POST', { mode }); }
  cue(id: string, direction: string, durationMs = 2000) {
    return this.request(`/api/v1/lights/${encodeURIComponent(id)}/cue`, 'POST', { direction, durationMs });
  }
  call(id: string) { return this.request(`/api/v1/lights/${encodeURIComponent(id)}/call`, 'POST'); }
  hold(id: string, hold: boolean) { return this.request(`/api/v1/lights/${encodeURIComponent(id)}/hold`, 'POST', { hold }); }
  brightness(id: string, brightness: 'low' | 'medium' | 'high') {
    return this.request(`/api/v1/lights/${encodeURIComponent(id)}/brightness`, 'POST', { brightness });
  }
  setSegments(id: string, segments: unknown[]) {
    return this.request(`/api/v1/lights/${encodeURIComponent(id)}/segments`, 'POST', { segments });
  }
  cycle(id: string) { return this.request(`/api/v1/lights/${encodeURIComponent(id)}/cycle`, 'POST'); }
}

export class RadioClient {
  constructor(readonly options: { BASE: string; TOKEN?: string }) {}
  async request<T>(path: string = '', method = 'GET', body?: unknown): Promise<T> {
    const url = `${this.options.BASE.replace(/\/+$/, '')}${path}`;
    const headers: Record<string, string> = {};
    if (this.options.TOKEN) headers['Authorization'] = `Bearer ${this.options.TOKEN}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      let detail = `Radio relay answered ${res.status}`;
      try {
        const j = await res.json() as Record<string, unknown>;
        if (j?.error) detail = typeof j.error === 'string' ? j.error : (j.error as Record<string, unknown>).message as string || detail;
      } catch {}
      throw Object.assign(new Error(detail), { status: res.status });
    }
    return (await res.json()) as T;
  }
  getStatus() { return this.request('/api/v1/radio-relay'); }
  start() { return this.request('/api/v1/radio-relay/start', 'POST'); }
  stop() { return this.request('/api/v1/radio-relay/stop', 'POST'); }
}

export class EncoderClient {
  constructor(readonly options: { BASE: string; TOKEN?: string }) {}
  async request<T>(path: string = '', method = 'GET', body?: unknown): Promise<T> {
    const url = `${this.options.BASE.replace(/\/+$/, '')}${path}`;
    const headers: Record<string, string> = {};
    if (this.options.TOKEN) headers['Authorization'] = `Bearer ${this.options.TOKEN}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      let detail = `Encoder answered ${res.status}`;
      try {
        const j = await res.json() as Record<string, unknown>;
        if (j?.error) detail = typeof j.error === 'string' ? j.error : (j.error as Record<string, unknown>).message as string || detail;
      } catch {}
      throw Object.assign(new Error(detail), { status: res.status });
    }
    return (await res.json()) as T;
  }
  getStatus() { return this.request('/api/v1/encoder'); }
  start(encoder: 1 | 2 | 'both' = 'both') { return this.request('/api/v1/encoder/start', 'POST', { encoder }); }
  stop(encoder: 1 | 2 | 'both' = 'both') { return this.request('/api/v1/encoder/stop', 'POST', { encoder }); }
  getInputStatus() { return this.request('/api/v1/encoder/input'); }
  getSettings() { return this.request('/api/v1/encoder/settings'); }
}

export interface Upstreams {
  pimatrix?: PimatrixClient;
  pivoice?: PivoiceClient;
  pitube?: PitubeClient;
  pilight?: PilightClient;
  radio?: RadioClient;
  encoder?: EncoderClient;
}

export type UpstreamName = keyof Upstreams;

/** One generated client per upstream. The upstream secret only ever lives inside the client's config. */
export function createUpstreams(config: Pick<Config, 'pimatrix' | 'pivoice' | 'pitube' | 'pilight' | 'radio' | 'encoder'>): Upstreams {
  return {
    ...(config.pimatrix ? { pimatrix: new PimatrixClient({ BASE: config.pimatrix.url, ...(config.pimatrix.secret ? { TOKEN: config.pimatrix.secret } : {}) }) } : {}),
    ...(config.pivoice ? { pivoice: new PivoiceClient({ BASE: config.pivoice.url, ...(config.pivoice.secret ? { TOKEN: config.pivoice.secret } : {}) }) } : {}),
    ...(config.pitube ? { pitube: new PitubeClient({ BASE: config.pitube.url, ...(config.pitube.secret ? { TOKEN: config.pitube.secret } : {}) }) } : {}),
    ...(config.pilight ? { pilight: new PilightClient({ BASE: config.pilight.url, ...(config.pilight.secret ? { TOKEN: config.pilight.secret } : {}) }) } : {}),
    ...(config.radio ? { radio: new RadioClient({ BASE: config.radio.url, ...(config.radio.secret ? { TOKEN: config.radio.secret } : {}) }) } : {}),
    ...(config.encoder ? { encoder: new EncoderClient({ BASE: config.encoder.url, ...(config.encoder.secret ? { TOKEN: config.encoder.secret } : {}) }) } : {}),
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
