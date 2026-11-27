import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT, exportJWK } from 'jose';
import { grantsForTunnusGroup, rightsForTunnusGroups } from '../src/users/permissions.js';
import { createTunnusVerifier, peekIssuer } from '../src/tunnus.js';
import { startHarness } from './harness.js';

describe('Tunnus group mapping', () => {
  it('maps standard presets and roles', () => {
    assert.deepEqual(grantsForTunnusGroup('@admin'), ['*:admin']);
    assert.deepEqual(grantsForTunnusGroup('@operator'), ['*:write']);
    assert.deepEqual(grantsForTunnusGroup('@viewer'), ['*:read']);
    assert.deepEqual(grantsForTunnusGroup('admin'), ['*:admin']);
    assert.deepEqual(grantsForTunnusGroup('operator'), ['*:write']);
    assert.deepEqual(grantsForTunnusGroup('viewer'), ['*:read']);
  });

  it('maps parish/<tenant>/<application>-<role level> formats', () => {
    // Application-wide level
    assert.deepEqual(grantsForTunnusGroup('parish/riihimaki/picontrol-operator'), ['*:write']);
    assert.deepEqual(grantsForTunnusGroup('parish/riihimaki/picontrol-admin'), ['*:admin']);
    assert.deepEqual(grantsForTunnusGroup('parish/riihimaki/picontrol-viewer'), ['*:read']);

    // Domain/module specific level with hyphen
    assert.deepEqual(grantsForTunnusGroup('parish/riihimaki/cameras-write'), ['cameras:write']);
    assert.deepEqual(grantsForTunnusGroup('parish/riihimaki/picam-admin'), ['cameras:admin']);
    assert.deepEqual(grantsForTunnusGroup('parish/riihimaki/matrix-operate'), ['routing:operate']);
  });

  it('maps parish/<tenant>/<application>:<level> formats', () => {
    assert.deepEqual(grantsForTunnusGroup('parish/riihimaki/picontrol:admin'), ['*:admin']);
    assert.deepEqual(grantsForTunnusGroup('parish/riihimaki/cameras:operate'), ['cameras:operate']);
    assert.deepEqual(grantsForTunnusGroup('parish/riihimaki/pivoice:read'), ['voice:read']);
  });

  it('computes effective rights across multiple groups', () => {
    const res = rightsForTunnusGroups([
      'parish/riihimaki/cameras-write',
      'parish/riihimaki/pivoice:read',
    ]);
    assert.equal(res.role, 'operator');
    assert.equal(res.rights.cameras, 2); // write/operate
    assert.equal(res.rights.voice, 1);   // read
    assert.equal(res.rights.routing, 0); // none
  });

  it('supports custom group mapping overrides', () => {
    const custom = new Map([
      ['custom-crew', ['atem:operate', 'sound:write']],
    ]);
    const grants = grantsForTunnusGroup('custom-crew', custom);
    assert.deepEqual(grants, ['atem:operate', 'sound:write']);
  });
});

describe('Tunnus token verification and MCP flow', () => {
  it('validates RS256 token against JWKS and serves MCP requests', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key-1';
    publicJwk.use = 'sig';
    publicJwk.alg = 'RS256';

    const issuer = 'https://kehitys.riihimaenseurakunta.fi/identity';
    const audience = 'picontrol-mcp';

    const verifier = createTunnusVerifier({
      issuer,
      audience,
      jwksUri: 'https://stub/jwks',
      fetchFn: (async (url: string) => {
        if (url === 'https://stub/jwks') {
          return new Response(JSON.stringify({ keys: [publicJwk] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error('Not found: ' + url);
      }) as typeof fetch,
    });

    const token = await new SignJWT({
      name: 'Matti Meikäläinen',
      email: 'matti@riihimaenseurakunta.fi',
      groups: ['parish/riihimaki/picontrol-operator'],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('matti-123')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    assert.equal(peekIssuer(token), issuer);

    // Verify token directly
    const claims = await verifier.verify(token);
    assert.equal(claims.sub, 'matti-123');
    assert.equal(claims.name, 'Matti Meikäläinen');
    assert.deepEqual(claims.groups, ['parish/riihimaki/picontrol-operator']);

    // Run via Harness and MCP endpoint
    const h = await startHarness({
      tunnus: { verifier },
    });
    try {
      const res = await fetch(h.base + '/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'system_whoami', arguments: {} },
        }),
      });

      assert.equal(res.status, 200);
      const text = await res.text();
      const data = text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
      const resultObj = data[0] ?? JSON.parse(text);
      assert.match(resultObj.result.content[0].text, /"user": "matti-123"/);
      assert.match(resultObj.result.content[0].text, /"role": "operator"/);
    } finally {
      await h.close();
    }
  });

  it('redirects /oauth/authorize to Tunnus identity when tunnus is enabled', async () => {
    const issuer = 'https://kehitys.riihimaenseurakunta.fi/identity';
    const verifier = createTunnusVerifier({
      issuer,
      fetchFn: async () => new Response(JSON.stringify({ keys: [] })),
    });

    const h = await startHarness({
      tunnus: { verifier },
    });
    try {
      const authRes = await fetch(h.base + '/oauth/authorize?client_id=test-client&redirect_uri=https://client.example/cb', {
        redirect: 'manual',
      });
      assert.equal(authRes.status, 302);
      const target = new URL(authRes.headers.get('location')!);
      assert.equal(target.origin + target.pathname, 'https://kehitys.riihimaenseurakunta.fi/identity/auth');
      assert.equal(target.searchParams.get('client_id'), 'test-client');

      // Check discovery includes Tunnus in authorization_servers
      const metaRes = await fetch(h.base + '/.well-known/oauth-protected-resource/mcp');
      const meta = (await metaRes.json()) as { authorization_servers: string[] };
      assert.ok(meta.authorization_servers.includes(issuer));
    } finally {
      await h.close();
    }
  });
});
