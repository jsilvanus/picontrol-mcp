import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHarness } from './harness.js';

let dir: string;
let usersPath: string;
before(() => { dir = mkdtempSync(join(tmpdir(), 'picontrol-cli-')); usersPath = join(dir, 'users.json'); });
after(() => rmSync(dir, { recursive: true, force: true }));

function cli(args: string[], stdin?: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli/user.ts', ...args], { env: { ...process.env, USERS_PATH: usersPath }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (err += chunk));
    child.on('close', code => resolve({ code, out, err }));
    child.stdin.end(stdin ?? '');
  });
}

describe('picontrol-mcp-user', () => {
  it('adds, lists, updates, issues a token and removes a user', async () => {
    const add = await cli(['add', 'Pekka', '--role', 'operator', '--display-name', 'Pekka P', '--password-stdin'], 'correct horse battery\n');
    assert.equal(add.code, 0, add.err);
    assert.equal(statSync(usersPath).mode & 0o777, 0o600);
    assert.ok(!readFileSync(usersPath, 'utf8').includes('correct horse battery'));

    const list = await cli(['list', '--json']);
    const rows = JSON.parse(list.out) as Array<{ name: string; permissions: Record<string, string> }>;
    assert.equal(rows[0]!.name, 'pekka');
    assert.equal(rows[0]!.permissions.atem, 'write');
    assert.ok(!list.out.includes('scrypt'), 'the hash is never printed');

    const update = await cli(['update', 'pekka', '--role', 'viewer', '--grant', 'program:write', '--deny', 'program:admin']);
    assert.equal(update.code, 0, update.err);
    assert.equal(JSON.parse(update.out).permissions.program, 'write');

    const token = await cli(['token', 'create', 'pekka', '--label', 'laptop', '--days', '30']);
    assert.equal(token.code, 0, token.err);
    assert.match(token.out, /pcm_[A-Za-z0-9_-]{40,}/);
    const id = token.out.match(/Token (tok_\w+)/)![1]!;
    assert.equal((await cli(['token', 'revoke', 'pekka', id])).code, 0);

    assert.equal((await cli(['remove', 'pekka'])).code, 0);
    assert.match((await cli(['list'])).out, /No users/);
  });

  it('refuses a short password, a duplicate and a password on the command line', async () => {
    assert.equal((await cli(['add', 'liisa', '--role', 'viewer', '--password-stdin'], 'short\n')).code, 1);
    assert.equal((await cli(['add', 'liisa', '--role', 'viewer', '--password-stdin'], 'correct horse battery\n')).code, 0);
    const again = await cli(['add', 'liisa', '--role', 'viewer', '--password-stdin'], 'correct horse battery\n');
    assert.equal(again.code, 1);
    assert.match(again.err, /already exists/);
    const withArg = await cli(['add', 'x1', '--role', 'viewer', '--password', 'secret-secret-secret'], 'correct horse battery\n');
    assert.notEqual(withArg.code, 0);
  });

  it('prints a JWT secret that the server accepts', async () => {
    const secret = (await cli(['secret'])).out.trim();
    assert.ok(Buffer.from(secret, 'base64').length >= 32);
  });
});

describe('token-only mode', () => {
  it('does not mount the OAuth endpoints', async () => {
    const h = await startHarness({ authMode: 'token' });
    assert.equal((await fetch(h.base + '/oauth/authorize')).status, 404);
    assert.equal((await fetch(h.base + '/.well-known/oauth-authorization-server')).status, 404);
    const res = await fetch(h.base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401);
    assert.doesNotMatch(res.headers.get('www-authenticate') ?? '', /resource_metadata/);
    await h.close();
  });
});
