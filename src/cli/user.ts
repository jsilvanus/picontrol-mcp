#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { effectiveRights, describeRights } from '../users/permissions.js';
import { UserError, UserStore, type UserRecord } from '../users/store.js';

const USAGE = `picontrol-mcp-user: manage who may use the Pi MCP server

  add <name> --role <role> [--display-name <text>] [--password-stdin]
  remove <name>
  update <name> [--role <role>] [--display-name <text>] [--password] [--password-stdin]
               [--disable | --enable] [--grant <domain:level>] [--deny <domain:level>]
               [--ungrant <domain:level>] [--undeny <domain:level>]
  list [--json]
  show <name>
  token create <name> --label <text> [--days <n>]     prints the token once
  token list <name>
  token revoke <name> <token-id>
  roles                                              built-in and custom roles
  secret                                             prints a new JWT_SECRET value

Passwords are read from the terminal (hidden) or, with --password-stdin, from one line of standard input.
They are never accepted as an argument. Users file: $USERS_PATH or ~/.config/picontrol-mcp/users.json.
Permissions are domain:level, for example program:write; domains: routing cameras atem program composites voice system (or *);
levels: read < write < admin. Roles: viewer (read), operator (write), admin.`;

const usersPath = () => process.env.USERS_PATH ?? join(process.env.PICONTROL_MCP_CONFIG_DIR ?? join(homedir(), '.config', 'picontrol-mcp'), 'users.json');

async function readLine(prompt: string, hidden: boolean): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) { rl.close(); return line; }
    return '';
  }
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = (text: string) => {
        if (text.includes(prompt)) process.stdout.write(text);
      };
    }
    rl.question(prompt, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

async function password(fromStdin: boolean, confirm: boolean): Promise<string> {
  if (fromStdin) return readLine('', false);
  const first = await readLine('Password (at least 12 characters): ', true);
  if (confirm && first !== (await readLine('Repeat password: ', true))) throw new UserError('The passwords do not match.');
  return first;
}

function summary(user: UserRecord, store: UserStore) {
  return {
    name: user.name, displayName: user.displayName, role: user.role, disabled: user.disabled,
    grants: user.extraGrants, denies: user.extraDenies, tokens: user.tokens.length,
    permissions: describeRights(effectiveRights(user, store.roles())),
  };
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const store = new UserStore(usersPath());
  const options = {
    role: { type: 'string' }, 'display-name': { type: 'string' }, 'password-stdin': { type: 'boolean' }, password: { type: 'boolean' },
    disable: { type: 'boolean' }, enable: { type: 'boolean' }, json: { type: 'boolean' }, label: { type: 'string' }, days: { type: 'string' },
    grant: { type: 'string', multiple: true }, deny: { type: 'string', multiple: true },
    ungrant: { type: 'string', multiple: true }, undeny: { type: 'string', multiple: true },
  } as const;
  const { values, positionals } = parseArgs({ args: rest, options, allowPositionals: true });

  switch (command) {
    case 'add': {
      const [name] = positionals;
      if (!name || !values.role) throw new UserError('Usage: add <name> --role <role>');
      const user = await store.create({ name, role: values.role, password: await password(Boolean(values['password-stdin']), true), ...(values['display-name'] ? { displayName: values['display-name'] } : {}) });
      console.log(`Added ${user.name} (${user.role}).`);
      return;
    }
    case 'remove': {
      const [name] = positionals;
      if (!name) throw new UserError('Usage: remove <name>');
      store.remove(name);
      console.log(`Removed ${name}. Their access ends with the next request.`);
      return;
    }
    case 'update': {
      const [name] = positionals;
      if (!name) throw new UserError('Usage: update <name> [options]');
      const wantsPassword = Boolean(values.password || values['password-stdin']);
      const user = await store.update(name, {
        ...(values.role ? { role: values.role } : {}),
        ...(values['display-name'] !== undefined ? { displayName: values['display-name'] } : {}),
        ...(wantsPassword ? { password: await password(Boolean(values['password-stdin']), true) } : {}),
        ...(values.disable ? { disabled: true } : values.enable ? { disabled: false } : {}),
        ...(values.grant ? { grant: values.grant } : {}), ...(values.deny ? { deny: values.deny } : {}),
        ...(values.ungrant ? { ungrant: values.ungrant } : {}), ...(values.undeny ? { undeny: values.undeny } : {}),
      });
      console.log(JSON.stringify(summary(user, store), null, 2));
      return;
    }
    case 'list': {
      const rows = store.list().map(user => summary(user, store));
      if (values.json) { console.log(JSON.stringify(rows, null, 2)); return; }
      if (rows.length === 0) { console.log('No users.'); return; }
      for (const row of rows) console.log(`${row.name.padEnd(20)} ${row.role.padEnd(10)} ${row.disabled ? 'disabled' : 'active  '} tokens: ${row.tokens}  ${row.displayName}`);
      return;
    }
    case 'show': {
      const user = positionals[0] ? store.getByName(positionals[0]) : undefined;
      if (!user) throw new UserError(`No user "${positionals[0] ?? ''}".`);
      console.log(JSON.stringify(summary(user, store), null, 2));
      return;
    }
    case 'token': {
      const [action, name, tokenId] = positionals;
      if (!action || !name) throw new UserError('Usage: token create|list|revoke <name> ...');
      if (action === 'create') {
        if (!values.label) throw new UserError('Usage: token create <name> --label <text> [--days <n>]');
        const days = values.days ? Number(values.days) : undefined;
        if (days !== undefined && (!Number.isFinite(days) || days <= 0)) throw new UserError('--days must be a positive number.');
        const { token, record } = store.createToken(name, values.label, days);
        console.log(`Token ${record.id} for ${name} (${record.label})${record.expires ? ', expires ' + record.expires : ', no expiry'}.\nCopy it now; it is not stored and cannot be shown again:\n\n${token}\n`);
        return;
      }
      if (action === 'list') {
        const user = store.getByName(name);
        if (!user) throw new UserError(`No user "${name}".`);
        for (const token of user.tokens) console.log(`${token.id}  ${token.label}  created ${token.createdAt}  expires ${token.expires ?? 'never'}`);
        if (user.tokens.length === 0) console.log('No tokens.');
        return;
      }
      if (action === 'revoke') {
        if (!tokenId) throw new UserError('Usage: token revoke <name> <token-id>');
        store.revokeToken(name, tokenId);
        console.log(`Revoked ${tokenId}.`);
        return;
      }
      throw new UserError(`Unknown token command "${action}".`);
    }
    case 'roles': {
      for (const [role, grants] of Object.entries(store.roles())) console.log(`${role.padEnd(12)} ${grants.join(', ')}`);
      return;
    }
    case 'secret':
      console.log(randomBytes(48).toString('base64'));
      return;
    default:
      console.log(USAGE);
      if (command && command !== 'help' && command !== '--help') process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof UserError ? error.message : error);
  process.exitCode = 1;
});
