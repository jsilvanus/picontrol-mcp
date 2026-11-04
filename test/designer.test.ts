import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { fakeUpstream, startHarness, type Harness } from './harness.js';

let fakeDesigner: Awaited<ReturnType<typeof fakeUpstream>>;
let h: Harness;
let token: string;

before(async () => {
  fakeDesigner = await fakeUpstream((call) => {
    if (call.url === '/api/v1/designer/state') {
      return {
        body: {
          valid: true,
          version: 1,
          state: { metadata: { title: 'Messu' }, rundown: [] },
          yaml: 'version: 2\ntitle: Messu',
        },
      };
    }
    if (call.url === '/api/v1/designer/items' && call.method === 'POST') {
      return {
        body: {
          ok: true,
          item: (call.body as any)?.item,
        },
      };
    }
    return { body: { ok: true } };
  });

  h = await startHarness({
    pirundownDesignerUrl: fakeDesigner.url,
  });

  await h.users.create({ name: 'olli', password: 'correct horse battery', role: 'operator' });
  token = h.users.createToken('olli', 'test').token;
});

after(async () => {
  await h.close();
  await fakeDesigner.close();
});

describe('designer MCP domain tools', () => {
  it('designer_get_state returns designer snapshot', async () => {
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(h.base + '/mcp'), {
      requestInit: { headers: { authorization: 'Bearer ' + token } },
    }));

    const result = await client.callTool({ name: 'designer_get_state', arguments: {} });
    assert.equal(result.isError, undefined);
    const content = (result as any).content[0]?.text;
    assert.ok(content.includes('Messu'));

    await client.close();
  });

  it('designer_add_item posts item to designer upstream', async () => {
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(h.base + '/mcp'), {
      requestInit: { headers: { authorization: 'Bearer ' + token } },
    }));

    const result = await client.callTool({
      name: 'designer_add_item',
      arguments: {
        item: {
          id: 'saarna',
          title: 'Saarna',
          section: 'Sana',
          ai: {
            targetZone: 'pulpit',
            graphicsOptions: {
              lowerThird: ['lower-third-speaker'],
            },
          },
        },
      },
    });

    assert.equal(result.isError, undefined);
    assert.ok(fakeDesigner.calls.some((c) => c.url === '/api/v1/designer/items' && c.method === 'POST'));

    await client.close();
  });
});
