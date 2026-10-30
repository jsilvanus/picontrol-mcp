import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { defaultPseudonymizer } from '../src/pseudonymize.js';
import { allows, effectiveRights } from '../src/users/permissions.js';
import { fakeUpstream, startHarness, type Harness } from './harness.js';

let h: Harness;
const tokens: Record<string, string> = {};
let pigateway: Awaited<ReturnType<typeof fakeUpstream>>;
let pigraphics: Awaited<ReturnType<typeof fakeUpstream>>;
let pirundown: Awaited<ReturnType<typeof fakeUpstream>>;
let pispace: Awaited<ReturnType<typeof fakeUpstream>>;
let pisound: Awaited<ReturnType<typeof fakeUpstream>>;

before(async () => {
  pigateway = await fakeUpstream(call => {
    if (call.url === '/api/v1/world-state') {
      return {
        body: {
          activeSpeaker: { mode: 'fusion', role: 'Celebrant / Liturgi' },
          subsystems: { pivoice: true, pisound: true, pispace: true, pirundown: true },
        },
      };
    }
    return undefined;
  });

  pigraphics = await fakeUpstream();
  pispace = await fakeUpstream();
  pisound = await fakeUpstream();

  // Register real name mapping in pseudonymizer
  defaultPseudonymizer.register('Kari Salonen', 'Celebrant / Liturgi');

  pirundown = await fakeUpstream(call => {
    if (call.url === '/api/v1/rundown/current') {
      return {
        body: {
          currentCue: { id: 'cue-1', title: 'Alkutervehdys', speaker: 'Kari Salonen' },
        },
      };
    }
    return undefined;
  });

  h = await startHarness({
    pigatewayUrl: pigateway.url,
    pigraphicsUrl: pigraphics.url,
    pirundownUrl: pirundown.url,
    pispaceUrl: pispace.url,
    pisoundUrl: pisound.url,
    piperceptionUrl: 'http://piperception',
    pimatrixUrl: 'http://pimatrix',
    pivoiceUrl: 'http://pivoice',
    pitubeUrl: 'http://pitube',
    pilightUrl: 'http://pilight',
    radioUrl: 'http://radio',
    encoderUrl: 'http://encoder',
  });

  // Create users representing each distinct role & scope
  // 1. Setup agent
  await h.users.create({ name: 'tech-setup', password: 'correct horse battery', role: 'setup' });
  tokens['tech-setup'] = h.users.createToken('tech-setup', 'setup-test').token;

  // 2. Stream-only live operator (e.g. AI Cloud Stream Director with event context)
  await h.users.create({ name: 'ai-stream-director', password: 'correct horse battery', role: 'operate', scopes: ['stream', 'event'] });
  tokens['ai-stream-director'] = h.users.createToken('ai-stream-director', 'stream-test').token;

  // 3. Church-only operator (sanctuary wall & PA)
  await h.users.create({ name: 'church-operator', password: 'correct horse battery', role: 'operate', scopes: ['church'] });
  tokens['church-operator'] = h.users.createToken('church-operator', 'church-test').token;

  // 4. Config agent (event prep & rundown creation)
  await h.users.create({ name: 'event-prep', password: 'correct horse battery', role: 'config' });
  tokens['event-prep'] = h.users.createToken('event-prep', 'config-test').token;

  // 5. View-only agent
  await h.users.create({ name: 'observer', password: 'correct horse battery', role: 'view' });
  tokens['observer'] = h.users.createToken('observer', 'view-test').token;
});

after(async () => {
  await h.close();
  await pigateway.close();
  await pigraphics.close();
  await pirundown.close();
  await pispace.close();
  await pisound.close();
});

async function connect(token: string) {
  const client = new Client({ name: 'test-client', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(h.base + '/mcp'), {
    requestInit: { headers: { authorization: 'Bearer ' + token } },
  }));
  return client;
}

describe('Roles, Scopes, and Privacy Isolation', () => {
  it('setup agent CANNOT run live event tools, but can calibrate hardware', async () => {
    const client = await connect(tokens['tech-setup']!);
    const toolNames = (await client.listTools()).tools.map(t => t.name);

    // Setup CAN calibrate FreeD tracking and configure perception
    assert.ok(toolNames.includes('space_calibrate_freed'));
    assert.ok(toolNames.includes('perception_configure'));

    // Setup CANNOT run live show actions (switching, cue progression, camera moves on air)
    assert.ok(!toolNames.includes('atem_switch'));
    assert.ok(!toolNames.includes('rundown_cue_next'));
    assert.ok(!toolNames.includes('camera_move'));
    assert.ok(!toolNames.includes('graphics_lower_third'));

    await client.close();
  });

  it('stream operator CAN trigger stream lower-thirds, but CANNOT alter church sanctuary sound', async () => {
    const client = await connect(tokens['ai-stream-director']!);
    const toolNames = (await client.listTools()).tools.map(t => t.name);

    // Stream operator has stream tools
    assert.ok(toolNames.includes('graphics_lower_third'));
    assert.ok(toolNames.includes('graphics_overlay'));

    // Stream operator does NOT have church-scoped sound/PA tools
    assert.ok(!toolNames.includes('sound_set_mute'));
    assert.ok(!toolNames.includes('sound_set_gain'));
    assert.ok(!toolNames.includes('sound_recall_preset'));

    await client.close();
  });

  it('church operator CAN adjust sanctuary mics, but CANNOT push stream graphics', async () => {
    const client = await connect(tokens['church-operator']!);
    const toolNames = (await client.listTools()).tools.map(t => t.name);

    // Church operator has sound tools
    assert.ok(toolNames.includes('sound_set_mute'));
    assert.ok(toolNames.includes('sound_set_gain'));

    // Church operator does NOT have stream-scoped graphics tools
    assert.ok(!toolNames.includes('graphics_lower_third'));
    assert.ok(!toolNames.includes('graphics_overlay'));

    await client.close();
  });

  it('view role can observe world state and rundown, but has zero mutating tools', async () => {
    const client = await connect(tokens['observer']!);
    const toolNames = (await client.listTools()).tools.map(t => t.name);
    assert.deepEqual(toolNames, ['system_whoami']);

    // Can read resources
    const resources = (await client.listResources()).resources.map(r => r.uri);
    assert.ok(resources.includes('pi://world/state'));
    assert.ok(resources.includes('pi://space/spatial'));
    assert.ok(resources.includes('pi://sound/channels'));

    await client.close();
  });

  it('pseudonymizes names in rundown resources (Kari Salonen -> Celebrant / Liturgi)', async () => {
    const client = await connect(tokens['ai-stream-director']!);
    const res = await client.readResource({ uri: 'pi://rundown/current' });
    const content = JSON.parse(res.contents[0]!.text as string);

    // The real name Kari Salonen was transformed into the role pseudonym
    assert.equal(content.currentCue.speaker, 'Celebrant / Liturgi');
    assert.ok(!JSON.stringify(content).includes('Kari Salonen'), 'Real name was not leaked to cloud agent');

    await client.close();
  });

  it('two-way pseudonymization restores real name when cloud agent calls graphics tool', async () => {
    const client = await connect(tokens['ai-stream-director']!);

    // Cloud AI director asks to show lower third for "Celebrant / Liturgi"
    await client.callTool({
      name: 'graphics_lower_third',
      arguments: {
        action: 'show',
        title: 'Celebrant / Liturgi',
        subtitle: 'Kirkkoherra',
      },
    });

    // Check downstream call received by pigraphics
    const lastCall = pigraphics.calls.at(-1);
    assert.ok(lastCall);
    assert.equal(lastCall.method, 'POST');
    assert.equal(lastCall.url, '/api/v1/graphics/lower-third');
    const body = lastCall.body as { action: string; title: string; subtitle?: string };
    // The local graphics engine received the real local name for on-screen broadcast rendering!
    assert.equal(body.title, 'Kari Salonen');
    assert.equal(body.subtitle, 'Kirkkoherra');

    await client.close();
  });
});
