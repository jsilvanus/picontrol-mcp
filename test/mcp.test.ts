import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DOMAIN_MODULES } from '../src/mcp/server.js';
import { allows } from '../src/users/permissions.js';
import { fakeUpstream, startHarness, type Harness } from './harness.js';

let pimatrix: Awaited<ReturnType<typeof fakeUpstream>>;
let pivoice: Awaited<ReturnType<typeof fakeUpstream>>;
let h: Harness;
const tokens: Record<string, string> = {};

const PIVOICE_CONFIG = {
  capture: { mode: 'alsa', device: 'hw:1,0' },
  radio: { bitrate: '96k', targets: [
    { id: 'local', name: 'Tuberadio', mode: 'on', rtmpUrl: 'rtmp://tuberadio:1935/live/***' },
    { id: 'relay', name: 'Relay', mode: 'auto', rtmpUrl: 'rtmp://relay.example:1935/live/***' },
  ] },
  auditor: { url: 'http://auditor', apiKey: '***', mode: 'on', language: 'fi' },
  captions: { relay: { mode: 'on', token: '***' }, youtube: { mode: 'off', streamKey: '***', delayMs: 0 } },
};

before(async () => {
  pimatrix = await fakeUpstream(call => {
    if (call.url === '/api/v1/cameras') return { body: { items: [{ id: 'cam1', name: 'Camera 1', mediaMtxPassword: 'LEAK' }] } };
    return undefined;
  });
  pivoice = await fakeUpstream(call => {
    if (call.url === '/api/v1/config') return { body: PIVOICE_CONFIG };
    if (call.url === '/api/v1/radio') return { body: { targets: [] } };
    return undefined;
  });
  h = await startHarness({ pimatrixUrl: pimatrix.url, pivoiceUrl: pivoice.url });
  for (const [name, role] of [['vera', 'viewer'], ['olli', 'operator'], ['aino', 'admin']] as const) {
    await h.users.create({ name, password: 'correct horse battery', role });
    tokens[name] = h.users.createToken(name, 'test').token;
  }
});
after(async () => { await h.close(); await pimatrix.close(); await pivoice.close(); });

async function connect(token: string) {
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(h.base + '/mcp'), { requestInit: { headers: { authorization: 'Bearer ' + token } } }));
  return client;
}
const textOf = (result: unknown) => ((result as { content: Array<{ text: string }> }).content[0]?.text ?? '');

describe('permissions on tools and resources', () => {
  it('lists only what each role may use', async () => {
    const viewer = await connect(tokens.vera!);
    const operator = await connect(tokens.olli!);
    const admin = await connect(tokens.aino!);
    const names = async (c: Client) => (await c.listTools()).tools.map(t => t.name);
    const v = await names(viewer), o = await names(operator), a = await names(admin);
    assert.deepEqual(v, ['system_whoami']);
    assert.ok(o.includes('atem_switch') && o.includes('voice_set_radio_mode') && o.includes('camera_move'));
    assert.ok(!o.includes('routing_set_lock') && !o.includes('program_configure_pipeline') && !o.includes('voice_configure'));
    for (const name of ['routing_set_lock', 'program_configure_pipeline', 'voice_configure']) assert.ok(a.includes(name));
    const resources = async (c: Client) => (await c.listResources()).resources.map(r => r.uri);
    assert.ok((await resources(viewer)).includes('pi://cameras'));
    assert.ok(!(await resources(viewer)).includes('pi://voice/config'), 'config is admin only');
    assert.ok((await resources(admin)).includes('pi://voice/config'));
    await Promise.all([viewer.close(), operator.close(), admin.close()]);
  });

  it('the listed tools are exactly the ones the role allows (all roles, all tools)', async () => {
    const level = { viewer: 1, operator: 2, admin: 3 } as const;
    for (const [user, role] of [['vera', 'viewer'], ['olli', 'operator'], ['aino', 'admin']] as const) {
      const client = await connect(tokens[user]!);
      const listed = new Set((await client.listTools()).tools.map(tool => tool.name));
      const listedResources = new Set((await client.listResources()).resources.map(resource => resource.uri));
      for (const module of DOMAIN_MODULES) {
        for (const tool of module.tools) {
          assert.equal(listed.has(tool.name), allows({ [tool.permission.domain]: level[role] } as never, tool.permission), `${role} / ${tool.name}`);
          if (tool.effect !== 'read') assert.notEqual(tool.permission.level, 'read', `${tool.name} changes state, so it cannot need only read`);
        }
        for (const resource of module.resources.filter(item => !item.uri.includes('{'))) {
          assert.equal(listedResources.has(resource.uri), allows({ [resource.permission.domain]: level[role] } as never, resource.permission), `${role} / ${resource.uri}`);
        }
      }
      await client.close();
    }
  });

  it('refuses a hidden tool called by name', async () => {
    const operator = await connect(tokens.olli!);
    const result = await operator.callTool({ name: 'routing_set_lock', arguments: { locked: true } });
    assert.equal(result.isError, true);
    await operator.close();
  });
});

describe('tools reach the upstream services', () => {
  it('camera_move calls pimatrix with the Bearer key and writes an audit entry', async () => {
    const operator = await connect(tokens.olli!);
    const before = pimatrix.calls.length;
    const result = await operator.callTool({ name: 'camera_move', arguments: { camera: 'cam1', direction: 'left', panSpeed: 5 } });
    assert.notEqual(result.isError, true, textOf(result));
    const call = pimatrix.calls[before]!;
    assert.equal(call.method, 'POST');
    assert.equal(call.url, '/api/v1/cameras/cam1/move');
    assert.deepEqual(call.body, { direction: 'left', panSpeed: 5 });
    assert.equal(call.authorization, 'Bearer pimatrix-secret-key');
    const audit = readFileSync(h.auditPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.ok(audit.some(entry => entry.tool === 'camera_move' && entry.user === 'olli' && entry.ok === true && entry.token === 'test'));
    await operator.close();
  });

  it('atem_switch needs an input for preview/program but not for cut', async () => {
    const operator = await connect(tokens.olli!);
    assert.equal((await operator.callTool({ name: 'atem_switch', arguments: { action: 'preview' } })).isError, true);
    const start = pimatrix.calls.length;
    await operator.callTool({ name: 'atem_switch', arguments: { action: 'preview', input: 3 } });
    await operator.callTool({ name: 'atem_switch', arguments: { action: 'cut' } });
    assert.deepEqual(pimatrix.calls.slice(start).map(c => `${c.method} ${c.url}`), ['PUT /api/v1/atem/preview', 'POST /api/v1/atem/cut']);
    await operator.close();
  });

  it('camera preset save needs the admin role for cameras', async () => {
    const operator = await connect(tokens.olli!);
    const denied = await operator.callTool({ name: 'camera_preset', arguments: { camera: 'cam1', action: 'save', preset: 4 } });
    assert.equal(denied.isError, true);
    const recall = await operator.callTool({ name: 'camera_preset', arguments: { camera: 'cam1', action: 'recall', preset: 4 } });
    assert.notEqual(recall.isError, true);
    const admin = await connect(tokens.aino!);
    const saved = await admin.callTool({ name: 'camera_preset', arguments: { camera: 'cam1', action: 'save', preset: 4, name: 'Altar' } });
    assert.notEqual(saved.isError, true, textOf(saved));
    await Promise.all([operator.close(), admin.close()]);
  });

  it('voice_set_radio_mode rewrites only the chosen target', async () => {
    const operator = await connect(tokens.olli!);
    const start = pivoice.calls.length;
    const result = await operator.callTool({ name: 'voice_set_radio_mode', arguments: { mode: 'auto', target: 'local' } });
    assert.notEqual(result.isError, true, textOf(result));
    const put = pivoice.calls.slice(start).find(call => call.method === 'PUT')!;
    assert.equal(put.url, '/api/v1/config');
    assert.equal(put.authorization, 'Bearer pivoice-secret-token');
    const targets = (put.body as { radio: { targets: Array<{ id: string; mode: string }> } }).radio.targets;
    assert.deepEqual(targets.map(t => [t.id, t.mode]), [['local', 'auto'], ['relay', 'auto']]);
    const unknown = await operator.callTool({ name: 'voice_set_radio_mode', arguments: { mode: 'off', target: 'nope' } });
    assert.equal(unknown.isError, true);
    await operator.close();
  });

  it('voice_set_captions_mode sets youtube like any destination', async () => {
    const operator = await connect(tokens.olli!);
    const start = pivoice.calls.length;
    await operator.callTool({ name: 'voice_set_captions_mode', arguments: { destination: 'youtube', mode: 'auto' } });
    const put = pivoice.calls.slice(start).find(call => call.method === 'PUT')!;
    assert.deepEqual(put.body, { captions: { youtube: { mode: 'auto' } } });
    await operator.close();
  });

  it('upstream errors come back as readable tool errors without secrets', async () => {
    const bad = await fakeUpstream(() => ({ status: 500, body: { error: { message: 'boom' } } }));
    const local = await startHarness({ pimatrixUrl: bad.url });
    await local.users.create({ name: 'olli', password: 'correct horse battery', role: 'operator' });
    const { token } = local.users.createToken('olli', 't');
    const client = new Client({ name: 't', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(local.base + '/mcp'), { requestInit: { headers: { authorization: 'Bearer ' + token } } }));
    const result = await client.callTool({ name: 'atem_switch', arguments: { action: 'cut' } });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /500.*boom/);
    await client.close(); await local.close(); await bad.close();
  });

  it('an unconfigured upstream hides its tools', async () => {
    const local = await startHarness({ pimatrixUrl: pimatrix.url });
    await local.users.create({ name: 'aino', password: 'correct horse battery', role: 'admin' });
    const { token } = local.users.createToken('aino', 't');
    const client = new Client({ name: 't', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(local.base + '/mcp'), { requestInit: { headers: { authorization: 'Bearer ' + token } } }));
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.ok(names.includes('atem_switch') && !names.some(name => name.startsWith('voice_')));
    await client.close(); await local.close();
  });
});

describe('resources', () => {
  it('reads state and redacts secrets', async () => {
    const viewer = await connect(tokens.vera!);
    const cameras = await viewer.readResource({ uri: 'pi://cameras' });
    const text = (cameras.contents[0] as { text: string }).text;
    assert.ok(text.includes('cam1') && !text.includes('LEAK'));
    const help = await viewer.readResource({ uri: 'pi://help/domains' });
    assert.match((help.contents[0] as { text: string }).text, /Pi stack guide/);
    const admin = await connect(tokens.aino!);
    const config = (await admin.readResource({ uri: 'pi://voice/config' })).contents[0] as { text: string };
    assert.ok(!/rtmp:\/\/[^"]*live\/[A-Za-z0-9]{4,}/.test(config.text));
    await Promise.all([viewer.close(), admin.close()]);
  });

  it('reads a templated resource', async () => {
    const viewer = await connect(tokens.vera!);
    const start = pimatrix.calls.length;
    await viewer.readResource({ uri: 'pi://cameras/cam2' });
    assert.equal(pimatrix.calls[start]!.url, '/api/v1/cameras/cam2');
    await viewer.close();
  });
});

describe('transport security', () => {
  const post = (headers: Record<string, string>) => fetch(h.base + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });

  it('answers 401 with a challenge without a token, and for a bad token', async () => {
    const none = await post({});
    assert.equal(none.status, 401);
    assert.match(none.headers.get('www-authenticate') ?? '', /resource_metadata=/);
    assert.equal((await post({ authorization: 'Bearer pcm_nope' })).status, 401);
    assert.equal((await post({ authorization: 'Bearer not.a.jwt' })).status, 401);
  });

  it('refuses a foreign Origin or Host (DNS rebinding)', async () => {
    assert.equal((await post({ authorization: 'Bearer ' + tokens.vera!, origin: 'https://evil.example' })).status, 403);
    // fetch() will not let a script set Host, so use the raw http client for that case.
    const status = await new Promise<number>(resolve => {
      const url = new URL(h.base + '/mcp');
      const req = httpRequest({ host: url.hostname, port: url.port, path: '/mcp', method: 'POST', headers: { host: 'evil.example', authorization: 'Bearer ' + tokens.vera!, 'content-type': 'application/json', accept: 'application/json, text/event-stream' } }, res => { res.resume(); resolve(res.statusCode ?? 0); });
      req.end('{}');
    });
    assert.equal(status, 403);
  });

  it('a removed or disabled user is refused on the next request', async () => {
    await h.users.create({ name: 'tmp', password: 'correct horse battery', role: 'admin' });
    const { token } = h.users.createToken('tmp', 't');
    assert.equal((await post({ authorization: 'Bearer ' + token })).status, 200);
    await h.users.update('tmp', { disabled: true });
    assert.equal((await post({ authorization: 'Bearer ' + token })).status, 401);
    await h.users.update('tmp', { disabled: false });
    assert.equal((await post({ authorization: 'Bearer ' + token })).status, 200);
    h.users.remove('tmp');
    assert.equal((await post({ authorization: 'Bearer ' + token })).status, 401);
  });
});
