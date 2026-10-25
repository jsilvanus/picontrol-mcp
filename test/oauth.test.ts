/**
 * End to end: sign in with a user name on the OAuth page, consent, PKCE token exchange, then /mcp.
 * The CIMD client metadata fetch is stubbed.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { LoginLimiter } from '../src/rate-limit.js';
import { startHarness, type Harness } from './harness.js';

const CLIENT_ID = 'https://client.example/oauth/client.json';
const REDIRECT_URI = 'https://client.example/callback';
const NAME = 'testi';
const PASSWORD = 'correct-horse-battery';

let h: Harness;
let base: string;
let now = 1_000_000;

before(async () => {
  h = await startHarness({
    authorization: {
      fetchClientMetadata: async (clientId: string) => ({ client_id: clientId, client_name: 'Test Client', redirect_uris: [REDIRECT_URI] }),
      limiter: new LoginLimiter(() => now, 3, 1000, 4000),
    },
  });
  base = h.base;
  await h.users.create({ name: NAME, displayName: 'Testi Käyttäjä', password: PASSWORD, role: 'operator' });
});
after(async () => { await h.close(); });

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
const authorizeQuery = (challenge: string) => new URLSearchParams({
  response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code_challenge: challenge,
  code_challenge_method: 'S256', state: 'xyz', scope: 'mcp', resource: 'http://127.0.0.1/mcp',
});
const postForm = (path: string, form: Record<string, string>) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString(), redirect: 'manual',
});
const hidden = (html: string, name: string) => html.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1];

async function signInPage(challenge: string) {
  const res = await fetch(base + '/oauth/authorize?' + authorizeQuery(challenge));
  const html = await res.text();
  return { res, oauth: hidden(html, 'oauth')! };
}
async function signIn(oauth: string, password = PASSWORD) {
  const res = await postForm('/oauth/authorize', { oauth, username: NAME, password });
  return { res, html: await res.text() };
}
async function mcp(token: string | null, body: unknown) {
  const res = await fetch(base + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
  return { status: res.status, message: data[0] ?? (text ? JSON.parse(text) : null) };
}

describe('OAuth authorization flow', () => {
  it('signs in, asks for consent, issues tokens and serves /mcp as that user', async () => {
    const { verifier, challenge } = pkce();
    const page = await signInPage(challenge);
    assert.equal(page.res.status, 200);
    const { res, html } = await signIn(page.oauth);
    assert.equal(res.status, 200);
    assert.match(html, /Test Client/);
    assert.match(html, /operator/);
    assert.match(res.headers.get('content-security-policy') ?? '', /https:\/\/client\.example/);

    const approved = await postForm('/oauth/authorize', { oauth: page.oauth, ticket: hidden(html, 'ticket')!, action: 'approve' });
    assert.equal(approved.status, 302);
    const location = new URL(approved.headers.get('location')!);
    const code = location.searchParams.get('code')!;
    assert.equal(location.searchParams.get('state'), 'xyz');

    const tokenRes = await postForm('/oauth/token', { grant_type: 'authorization_code', code, client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code_verifier: verifier });
    assert.equal(tokenRes.status, 200);
    const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string };

    await mcp(tokens.access_token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    const who = await mcp(tokens.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'system_whoami', arguments: {} } });
    assert.equal(who.status, 200);
    assert.match(who.message.result.content[0].text, /"user": "testi"/);
    assert.match(who.message.result.content[0].text, /"role": "operator"/);

    // Refresh works while the user exists, and stops when the user is disabled.
    const refresh = () => postForm('/oauth/token', { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: CLIENT_ID });
    assert.equal((await refresh()).status, 200);
    await h.users.update(NAME, { disabled: true });
    assert.equal((await refresh()).status, 400);
    assert.equal((await mcp(tokens.access_token, { jsonrpc: '2.0', id: 3, method: 'tools/list' })).status, 401);
    await h.users.update(NAME, { disabled: false });
  });

  it('redirects with access_denied when the user denies', async () => {
    const page = await signInPage(pkce().challenge);
    const { html } = await signIn(page.oauth);
    const res = await postForm('/oauth/authorize', { oauth: page.oauth, ticket: hidden(html, 'ticket')!, action: 'deny' });
    assert.equal(res.status, 302);
    assert.equal(new URL(res.headers.get('location')!).searchParams.get('error'), 'access_denied');
  });

  it('rejects consent without a valid or matching login ticket', async () => {
    const first = await signInPage(pkce().challenge);
    assert.equal((await postForm('/oauth/authorize', { oauth: first.oauth, action: 'approve' })).status, 401);
    assert.equal((await postForm('/oauth/authorize', { oauth: first.oauth, action: 'approve', ticket: 'forged' })).status, 401);
    const ticket = hidden((await signIn(first.oauth)).html, 'ticket')!;
    const second = await signInPage(pkce().challenge);
    assert.equal((await postForm('/oauth/authorize', { oauth: second.oauth, ticket, action: 'approve' })).status, 401);
  });

  it('rejects a wrong password and an unknown user the same way, then locks after repeated failures', async () => {
    const { oauth } = await signInPage(pkce().challenge);
    const wrong = await postForm('/oauth/authorize', { oauth, username: NAME, password: 'wrong-password-1' });
    const unknown = await postForm('/oauth/authorize', { oauth, username: 'nobody', password: 'wrong-password-1' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal((await wrong.text()).includes('Invalid user name or password'), true);
    await signIn(oauth, 'wrong-password-2');
    await signIn(oauth, 'wrong-password-3');
    const locked = await signIn(oauth, PASSWORD);
    assert.equal(locked.res.status, 429, 'even the right password waits while locked');
    now += 10_000;
    assert.equal((await signIn(oauth, PASSWORD)).res.status, 200);
  });
});

describe('MCP endpoint', () => {
  it('answers 401 with WWW-Authenticate without a token', async () => {
    const res = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401);
    assert.match(res.headers.get('www-authenticate') ?? '', /resource_metadata=/);
  });
  it('serves discovery metadata', async () => {
    const meta = await (await fetch(base + '/.well-known/oauth-protected-resource/mcp')).json() as { resource: string };
    assert.equal(meta.resource, 'http://127.0.0.1/mcp');
    assert.equal((await fetch(base + '/.well-known/oauth-authorization-server')).status, 200);
  });
});
