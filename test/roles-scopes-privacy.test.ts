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
    if (call.url === '/api/v1/actions/dispatch') {
      return {
        body: { ok: true, result: { action: (call.body as { action: unknown })?.action, ok: true } },
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

  it('view role can read rundown schemas and help documentation', async () => {
    const client = await connect(tokens['observer']!);

    const schemaRes = await client.readResource({ uri: 'pi://schema/rundown-v2' });
    const schema = JSON.parse(schemaRes.contents[0]!.text as string);
    assert.equal(schema.title, 'RundownV2');
    assert.equal(schema.properties.version.const, 2);

    const actionSchemaRes = await client.readResource({ uri: 'pi://schema/actions' });
    const actionSchema = JSON.parse(actionSchemaRes.contents[0]!.text as string);
    assert.equal(actionSchema.title, 'RundownActionItem');

    const helpRes = await client.readResource({ uri: 'pi://help/rundown' });
    assert.ok((helpRes.contents[0]!.text as string).includes('Rundown v2 Authoring Guide'));

    const actionHelpRes = await client.readResource({ uri: 'pi://help/actions' });
    assert.ok((actionHelpRes.contents[0]!.text as string).includes('Rundown Actions and Macro Reference'));

    await client.close();
  });

  it('church-only operator cannot access event-scoped rundown schemas or tools', async () => {
    const client = await connect(tokens['church-operator']!);
    const resources = (await client.listResources()).resources.map(r => r.uri);
    assert.ok(!resources.includes('pi://schema/rundown-v2'));
    assert.ok(!resources.includes('pi://help/rundown'));

    const tools = (await client.listTools()).tools.map(t => t.name);
    assert.ok(!tools.includes('rundown_action_exec'));
    await client.close();
  });

  it('stream operator can dispatch actions via rundown_action_exec with pseudonym translation', async () => {
    const client = await connect(tokens['ai-stream-director']!);

    const result = await client.callTool({
      name: 'rundown_action_exec',
      arguments: {
        action: { cam: { id: 1, preset: 'Celebrant / Liturgi' } },
        dryRun: false,
      },
    });

    assert.equal(result.isError, undefined);
    const lastCall = pirundown.calls.at(-1);
    assert.ok(lastCall);
    assert.equal(lastCall.method, 'POST');
    assert.equal(lastCall.url, '/api/v1/actions/dispatch');
    const body = lastCall.body as { action: { cam: { id: number; preset: string } }; dryRun: boolean };
    // Two-way pseudonymizer translated role back to local name
    assert.equal(body.action.cam.preset, 'Kari Salonen');
    assert.equal(body.dryRun, false);

    await client.close();
  });

  it('view role is refused when calling rundown_action_exec', async () => {
    const client = await connect(tokens['observer']!);
    const result = await client.callTool({
      name: 'rundown_action_exec',
      arguments: { action: 'cam:1:preset:altar' },
    });
    assert.equal(result.isError, true);
    await client.close();
  });
});
