import { Client as PimatrixClient, ApiError as PimatrixApiError } from './generated/pimatrix/index.js';
import { Client as PivoiceClient, ApiError as PivoiceApiError } from './generated/pivoice/index.js';
import type { Config } from './config.js';

class BaseUpstreamClient {
  constructor(readonly options: { BASE: string; TOKEN?: string }, readonly name = 'Upstream') {}
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
      let detail = `${this.name} answered ${res.status}`;
      try {
        const j = await res.json() as Record<string, unknown>;
        if (j?.error) detail = typeof j.error === 'string' ? j.error : (j.error as Record<string, unknown>).message as string || detail;
      } catch {}
      throw Object.assign(new Error(detail), { status: res.status });
    }
    return (await res.json()) as T;
  }
}

export class PitubeClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'pitube'); }
  getStatus() { return this.request('/api/v1/status'); }
  listBroadcasts() { return this.request<{ selectedId: string | null; items: unknown[] }>('/api/v1/broadcasts'); }
  selectBroadcast(broadcastId: string) { return this.request('/api/v1/broadcasts/select', 'POST', { broadcastId }); }
  createBroadcast(input: { title: string; privacy?: string | undefined; description?: string | undefined; scheduledStartTime?: string | undefined }) {
    return this.request('/api/v1/broadcasts/create', 'POST', input);
  }
  startBroadcast() { return this.request('/api/v1/broadcasts/start', 'POST'); }
  stopBroadcast() { return this.request('/api/v1/broadcasts/stop', 'POST'); }
}

export class PilightClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'pilight'); }
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

export class RadioClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'Radio relay'); }
  getStatus() { return this.request('/api/v1/radio-relay'); }
  start() { return this.request('/api/v1/radio-relay/start', 'POST'); }
  stop() { return this.request('/api/v1/radio-relay/stop', 'POST'); }
}

export class EncoderClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'Encoder'); }
  getStatus() { return this.request('/api/v1/encoder'); }
  start(encoder: 1 | 2 | 'both' = 'both') { return this.request('/api/v1/encoder/start', 'POST', { encoder }); }
  stop(encoder: 1 | 2 | 'both' = 'both') { return this.request('/api/v1/encoder/stop', 'POST', { encoder }); }
  getInputStatus() { return this.request('/api/v1/encoder/input'); }
  getSettings() { return this.request('/api/v1/encoder/settings'); }
}

export class PigatewayClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'pigateway'); }
  getWorldState() { return this.request('/api/v1/world-state'); }
  refreshWorldState() { return this.request('/api/v1/world-state/refresh', 'POST'); }
  getStatus() { return this.request('/api/v1/status'); }
  getRundown() { return this.request('/api/v1/rundown'); }
  advanceRundown(step?: number) { return this.request('/api/v1/rundown/advance', 'POST', { step }); }
}

export class PispaceClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'pispace'); }
  getSpatial() { return this.request('/api/v1/spatial'); }
  getZones() { return this.request('/api/v1/zones'); }
  getCameras() { return this.request('/api/v1/cameras'); }
  frameSubject(camera: string, target: unknown) {
    return this.request(`/api/v1/cameras/${encodeURIComponent(camera)}/frame`, 'POST', target);
  }
  calibrateFreed(camera: string, offsets: unknown) {
    return this.request(`/api/v1/cameras/${encodeURIComponent(camera)}/freed/calibrate`, 'POST', offsets);
  }
}

export class PiperceptionClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'piperception'); }
  getStatus() { return this.request('/api/v1/status'); }
  getDetections() { return this.request('/api/v1/detections'); }
  configure(config: unknown) { return this.request('/api/v1/config', 'POST', config); }
}

export class PisoundClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'pisound'); }
  getStatus() { return this.request('/api/v1/status'); }
  getChannels() { return this.request('/api/v1/channels'); }
  setMute(channelId: string, mute: boolean) {
    return this.request(`/api/v1/channels/${encodeURIComponent(channelId)}/mute`, 'POST', { mute });
  }
  setGain(channelId: string, gainDb: number) {
    return this.request(`/api/v1/channels/${encodeURIComponent(channelId)}/gain`, 'POST', { gainDb });
  }
  recallPreset(name: string) {
    return this.request(`/api/v1/presets/${encodeURIComponent(name)}/recall`, 'POST');
  }
}

export class PirundownClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'pirundown'); }
  getCurrent() { return this.request('/api/v1/rundown/current'); }
  nextCue() { return this.request('/api/v1/rundown/next', 'POST'); }
  prevCue() { return this.request('/api/v1/rundown/prev', 'POST'); }
  gotoCue(cueId: string) { return this.request('/api/v1/rundown/goto', 'POST', { cueId }); }
  createOrUpdate(cueSheet: unknown) { return this.request('/api/v1/rundown', 'POST', cueSheet); }
  dispatchAction(action: unknown, dryRun?: boolean) {
    return this.request('/api/v1/actions/dispatch', 'POST', { action, ...(dryRun !== undefined ? { dryRun } : {}) });
  }
}

export class PigraphicsClient extends BaseUpstreamClient {
  constructor(options: { BASE: string; TOKEN?: string }) { super(options, 'pigraphics'); }
  getStatus() { return this.request('/api/v1/graphics'); }
  lowerThird(action: 'show' | 'hide', data?: { title: string; subtitle?: string; durationMs?: number }) {
    return this.request('/api/v1/graphics/lower-third', 'POST', { action, ...(data ?? {}) });
  }
  overlay(action: 'show' | 'hide', data?: { type: string; content: string }) {
    return this.request('/api/v1/graphics/overlay', 'POST', { action, ...(data ?? {}) });
  }
}

export interface Upstreams {
  pimatrix?: PimatrixClient;
  pivoice?: PivoiceClient;
  pitube?: PitubeClient;
  pilight?: PilightClient;
  radio?: RadioClient;
  encoder?: EncoderClient;
  pigateway?: PigatewayClient;
  pispace?: PispaceClient;
  piperception?: PiperceptionClient;
  pisound?: PisoundClient;
  pirundown?: PirundownClient;
  pigraphics?: PigraphicsClient;
}

export type UpstreamName = keyof Upstreams;

/** One client per upstream service. */
export function createUpstreams(config: Partial<Config>): Upstreams {
  return {
    ...(config.pimatrix ? { pimatrix: new PimatrixClient({ BASE: config.pimatrix.url, ...(config.pimatrix.secret ? { TOKEN: config.pimatrix.secret } : {}) }) } : {}),
    ...(config.pivoice ? { pivoice: new PivoiceClient({ BASE: config.pivoice.url, ...(config.pivoice.secret ? { TOKEN: config.pivoice.secret } : {}) }) } : {}),
    ...(config.pitube ? { pitube: new PitubeClient({ BASE: config.pitube.url, ...(config.pitube.secret ? { TOKEN: config.pitube.secret } : {}) }) } : {}),
    ...(config.pilight ? { pilight: new PilightClient({ BASE: config.pilight.url, ...(config.pilight.secret ? { TOKEN: config.pilight.secret } : {}) }) } : {}),
    ...(config.radio ? { radio: new RadioClient({ BASE: config.radio.url, ...(config.radio.secret ? { TOKEN: config.radio.secret } : {}) }) } : {}),
    ...(config.encoder ? { encoder: new EncoderClient({ BASE: config.encoder.url, ...(config.encoder.secret ? { TOKEN: config.encoder.secret } : {}) }) } : {}),
    ...(config.pigateway ? { pigateway: new PigatewayClient({ BASE: config.pigateway.url, ...(config.pigateway.secret ? { TOKEN: config.pigateway.secret } : {}) }) } : {}),
    ...(config.pispace ? { pispace: new PispaceClient({ BASE: config.pispace.url, ...(config.pispace.secret ? { TOKEN: config.pispace.secret } : {}) }) } : {}),
    ...(config.piperception ? { piperception: new PiperceptionClient({ BASE: config.piperception.url, ...(config.piperception.secret ? { TOKEN: config.piperception.secret } : {}) }) } : {}),
    ...(config.pisound ? { pisound: new PisoundClient({ BASE: config.pisound.url, ...(config.pisound.secret ? { TOKEN: config.pisound.secret } : {}) }) } : {}),
    ...(config.pirundown ? { pirundown: new PirundownClient({ BASE: config.pirundown.url, ...(config.pirundown.secret ? { TOKEN: config.pirundown.secret } : {}) }) } : {}),
    ...(config.pigraphics ? { pigraphics: new PigraphicsClient({ BASE: config.pigraphics.url, ...(config.pigraphics.secret ? { TOKEN: config.pigraphics.secret } : {}) }) } : {}),
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
