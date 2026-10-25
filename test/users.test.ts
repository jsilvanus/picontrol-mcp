import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allows, effectiveRights } from '../src/users/permissions.js';
import { hashPassword, verifyPassword, needsRehash } from '../src/users/passwords.js';
import { UserError, UserStore } from '../src/users/store.js';
import { LoginLimiter } from '../src/rate-limit.js';
import { redact } from '../src/redact.js';

let dir: string;
before(() => { dir = mkdtempSync(join(tmpdir(), 'picontrol-users-')); });
after(() => rmSync(dir, { recursive: true, force: true }));

describe('passwords', () => {
  it('hashes with scrypt and verifies', async () => {
    const hash = await hashPassword('a long enough password');
    assert.match(hash, /^scrypt\$N=32768,r=8,p=1\$/);
    assert.equal(await verifyPassword(hash, 'a long enough password'), true);
    assert.equal(await verifyPassword(hash, 'another password!!'), false);
    assert.equal(await verifyPassword('garbage', 'x'), false);
    assert.equal(needsRehash(hash), false);
    assert.equal(needsRehash('scrypt$N=1024,r=8,p=1$AAAA$AAAA'), true);
  });
});

describe('rights', () => {
  it('maps built-in roles', () => {
    const viewer = effectiveRights({ role: 'viewer', extraGrants: [], extraDenies: [] });
    assert.equal(allows(viewer, { domain: 'cameras', level: 'read' }), true);
    assert.equal(allows(viewer, { domain: 'cameras', level: 'write' }), false);
    const operator = effectiveRights({ role: 'operator', extraGrants: [], extraDenies: [] });
    assert.equal(allows(operator, { domain: 'atem', level: 'write' }), true);
    assert.equal(allows(operator, { domain: 'atem', level: 'admin' }), false);
    assert.equal(allows(effectiveRights({ role: 'admin', extraGrants: [], extraDenies: [] }), { domain: 'voice', level: 'admin' }), true);
  });
  it('applies grants and denies; a deny removes that level and above only', () => {
    const slides = effectiveRights({ role: 'viewer', extraGrants: ['program:write', 'composites:write'], extraDenies: [] });
    assert.equal(allows(slides, { domain: 'program', level: 'write' }), true);
    assert.equal(allows(slides, { domain: 'atem', level: 'write' }), false);
    const careful = effectiveRights({ role: 'admin', extraGrants: [], extraDenies: ['atem:write'] });
    assert.equal(allows(careful, { domain: 'atem', level: 'read' }), true);
    assert.equal(allows(careful, { domain: 'atem', level: 'write' }), false);
    assert.equal(allows(careful, { domain: 'atem', level: 'admin' }), false);
    assert.equal(allows(careful, { domain: 'cameras', level: 'admin' }), true);
  });
  it('rejects unknown permissions', () => {
    assert.throws(() => effectiveRights({ role: 'viewer', extraGrants: ['lights:write'], extraDenies: [] }), /Unknown permission domain/);
  });
});

describe('UserStore', () => {
  it('creates, authenticates, updates and removes users; file is 0600', async () => {
    const store = new UserStore(join(dir, 'a', 'users.json'));
    const user = await store.create({ name: 'Anna', password: 'correct horse battery', role: 'operator', displayName: 'Anna K' });
    assert.equal(user.name, 'anna');
    assert.equal(statSync(store.filePath).mode & 0o777, 0o600);
    assert.doesNotThrow(() => store.assertSecure());
    assert.ok(!readFileSync(store.filePath, 'utf8').includes('correct horse'));
    assert.equal(store.principal(user.id)?.role, 'operator');

    await assert.rejects(store.create({ name: 'anna', password: 'another password 1', role: 'viewer' }), UserError);
    await assert.rejects(store.create({ name: 'bob', password: 'short', role: 'viewer' }), /at least 12/);
    await assert.rejects(store.create({ name: 'bob', password: 'long enough password', role: 'boss' }), /Unknown role/);

    await store.update('anna', { role: 'viewer', grant: ['program:write'], disabled: true });
    assert.equal(store.principal(user.id), undefined, 'disabled users have no principal');
    await store.update('anna', { disabled: false });
    assert.equal(store.principal(user.id)?.rights.program, 2);

    store.remove('anna');
    assert.equal(store.principal(user.id), undefined);
    assert.throws(() => store.remove('anna'), /No user/);
  });

  it('refuses a users file that others can read', async () => {
    const store = new UserStore(join(dir, 'b', 'users.json'));
    await store.create({ name: 'carl', password: 'correct horse battery', role: 'admin' });
    chmodSync(store.filePath, 0o644);
    assert.throws(() => store.assertSecure(), /must be 0600/);
  });

  it('sees changes made by another process (the CLI)', async () => {
    const path = join(dir, 'c', 'users.json');
    const server = new UserStore(path);
    const user = await new UserStore(path).create({ name: 'dora', password: 'correct horse battery', role: 'viewer' });
    assert.equal(server.principal(user.id)?.role, 'viewer');
    await new UserStore(path).update('dora', { role: 'admin' });
    assert.equal(server.principal(user.id)?.role, 'admin');
    new UserStore(path).remove('dora');
    assert.equal(server.principal(user.id), undefined);
  });

  it('issues personal access tokens stored only as hashes, with expiry and revoke', async () => {
    const store = new UserStore(join(dir, 'd', 'users.json'));
    await store.create({ name: 'erik', password: 'correct horse battery', role: 'operator' });
    const { token, record } = store.createToken('erik', 'claude-code');
    assert.match(token, /^pcm_/);
    assert.ok(!readFileSync(store.filePath, 'utf8').includes(token));
    assert.equal(store.findByToken(token)?.tokenLabel, 'claude-code');
    assert.equal(store.findByToken(token + 'x'), undefined);
    const short = store.createToken('erik', 'short', 1);
    assert.equal(store.findByToken(short.token, Date.now() + 2 * 86_400_000), undefined, 'expired');
    store.revokeToken('erik', record.id);
    assert.equal(store.findByToken(token), undefined);
  });
});

describe('LoginLimiter', () => {
  it('locks after repeated failures with growing waits and resets on success', () => {
    let now = 1_000_000;
    const limiter = new LoginLimiter(() => now, 3, 1000, 8000);
    for (let i = 0; i < 3; i++) limiter.fail('k');
    assert.equal(limiter.retryAfter('k'), 1000);
    now += 1000;
    limiter.fail('k');
    assert.equal(limiter.retryAfter('k'), 2000);
    limiter.fail('k'); limiter.fail('k'); limiter.fail('k'); limiter.fail('k');
    assert.equal(limiter.retryAfter('k'), 8000, 'capped');
    limiter.succeed('k');
    assert.equal(limiter.retryAfter('k'), 0);
    assert.equal(limiter.retryAfter('other'), 0);
  });
});

describe('redact', () => {
  it('masks secrets and stream keys', () => {
    const out = redact({
      mediaMtxPassword: 'x', auditor: { apiKey: 'k', url: 'http://a' }, hasToken: true,
      radio: { targets: [{ id: 'relay', rtmpUrl: 'rtmp://relay.example:1935/live/SECRETKEY' }] }, token: 'abc',
    });
    const text = JSON.stringify(out);
    assert.ok(!text.includes('SECRETKEY') && !text.includes('"abc"') && !text.includes('"k"'));
    assert.equal(out.hasToken, true);
    assert.equal(out.auditor.url, 'http://a');
  });
});
