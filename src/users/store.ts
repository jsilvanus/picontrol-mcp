import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BUILT_IN_ROLES, effectiveRights, parsePermission, type EffectiveRights, type PermissionText } from './permissions.js';
import { checkPasswordPolicy, hashPassword } from './passwords.js';

export interface TokenRecord {
  id: string;
  label: string;
  /** SHA-256 of the token. The token itself is shown once, when it is created. */
  sha256: string;
  createdAt: string;
  expires: string | null;
}

export interface UserRecord {
  id: string;
  name: string;
  displayName: string;
  passwordHash: string;
  role: string;
  extraGrants: PermissionText[];
  extraDenies: PermissionText[];
  disabled: boolean;
  createdAt: string;
  tokens: TokenRecord[];
}

interface UsersFile {
  version: 1;
  roles?: Record<string, PermissionText[]>;
  users: UserRecord[];
}

export interface Principal {
  id: string;
  name: string;
  displayName: string;
  role: string;
  rights: EffectiveRights;
  /** Set when the caller used a personal access token. */
  tokenLabel?: string;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;
export const TOKEN_PREFIX = 'pcm_';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class UserError extends Error {}

/**
 * Users live in one JSON file with mode 0600. The server re-reads it when the file changes, so edits made with the
 * CLI apply on the next request: a removed or disabled user loses access immediately.
 */
export class UserStore {
  private cache: { stamp: string; file: UsersFile } | undefined;

  constructor(private readonly path: string) {}

  get filePath(): string {
    return this.path;
  }

  /** Throws when the file is readable by group or others. Used at server start. */
  assertSecure(): void {
    if (!existsSync(this.path)) return;
    const mode = statSync(this.path).mode & 0o777;
    if (mode & 0o077) {
      throw new Error(`${this.path} has mode ${mode.toString(8)}; it holds password hashes and must be 0600 (chmod 600).`);
    }
  }

  private read(): UsersFile {
    if (!existsSync(this.path)) return { version: 1, users: [] };
    const stat = statSync(this.path);
    const stamp = `${stat.mtimeMs}:${stat.size}`;
    if (this.cache?.stamp === stamp) return this.cache.file;
    const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as UsersFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.users)) throw new Error(`${this.path}: unsupported users file`);
    this.cache = { stamp, file: parsed };
    return parsed;
  }

  private write(file: UsersFile): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, this.path);
    this.cache = undefined;
  }

  roles(): Record<string, PermissionText[]> {
    return { ...BUILT_IN_ROLES, ...(this.read().roles ?? {}) };
  }

  list(): UserRecord[] {
    return this.read().users;
  }

  getById(id: string): UserRecord | undefined {
    return this.read().users.find(user => user.id === id);
  }

  getByName(name: string): UserRecord | undefined {
    const wanted = name.trim().toLowerCase();
    return this.read().users.find(user => user.name === wanted);
  }

  /** The caller as the MCP layer sees it, or undefined for an unknown or disabled user. */
  principal(id: string, tokenLabel?: string): Principal | undefined {
    const user = this.getById(id);
    if (!user || user.disabled) return undefined;
    return {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      role: user.role,
      rights: effectiveRights(user, this.roles()),
      ...(tokenLabel ? { tokenLabel } : {}),
    };
  }

  /** Finds the user a personal access token belongs to. Expired tokens do not match. */
  findByToken(token: string, now = Date.now()): Principal | undefined {
    if (!token.startsWith(TOKEN_PREFIX)) return undefined;
    const digest = hashToken(token);
    for (const user of this.read().users) {
      const record = user.tokens.find(candidate => candidate.sha256 === digest);
      if (!record) continue;
      if (record.expires && Date.parse(record.expires) < now) return undefined;
      return this.principal(user.id, record.label);
    }
    return undefined;
  }

  private validateRole(role: string, grants: PermissionText[], denies: PermissionText[]): void {
    if (!(role in this.roles())) throw new UserError(`Unknown role "${role}" (known: ${Object.keys(this.roles()).join(', ')})`);
    for (const text of [...grants, ...denies]) {
      try { parsePermission(text); } catch (error) { throw new UserError((error as Error).message); }
    }
  }

  async create(input: { name: string; displayName?: string; password: string; role: string }): Promise<UserRecord> {
    const name = input.name.trim().toLowerCase();
    if (!NAME_PATTERN.test(name)) throw new UserError('User name: 2-32 characters, a-z, 0-9, dot, dash, underscore; must start with a letter or digit.');
    if (this.getByName(name)) throw new UserError(`User "${name}" already exists.`);
    const problem = checkPasswordPolicy(input.password);
    if (problem) throw new UserError(problem);
    this.validateRole(input.role, [], []);
    const user: UserRecord = {
      id: 'usr_' + randomBytes(5).toString('hex'),
      name,
      displayName: input.displayName?.trim() || name,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      extraGrants: [],
      extraDenies: [],
      disabled: false,
      createdAt: new Date().toISOString(),
      tokens: [],
    };
    const file = this.read();
    this.write({ ...file, users: [...file.users, user] });
    return user;
  }

  async update(name: string, patch: {
    displayName?: string; password?: string; role?: string; disabled?: boolean;
    grant?: PermissionText[]; deny?: PermissionText[]; ungrant?: PermissionText[]; undeny?: PermissionText[];
  }): Promise<UserRecord> {
    const file = this.read();
    const current = this.getByName(name);
    if (!current) throw new UserError(`No user "${name}".`);
    const next: UserRecord = { ...current };
    if (patch.displayName !== undefined) next.displayName = patch.displayName.trim() || current.name;
    if (patch.password !== undefined) {
      const problem = checkPasswordPolicy(patch.password);
      if (problem) throw new UserError(problem);
      next.passwordHash = await hashPassword(patch.password);
    }
    if (patch.role !== undefined) next.role = patch.role;
    if (patch.disabled !== undefined) next.disabled = patch.disabled;
    const merge = (base: string[], add: string[] = [], remove: string[] = []) => [...new Set([...base, ...add])].filter(item => !remove.includes(item));
    next.extraGrants = merge(current.extraGrants, patch.grant, patch.ungrant);
    next.extraDenies = merge(current.extraDenies, patch.deny, patch.undeny);
    this.validateRole(next.role, next.extraGrants, next.extraDenies);
    this.write({ ...file, users: file.users.map(user => (user.id === current.id ? next : user)) });
    return next;
  }

  remove(name: string): void {
    const file = this.read();
    const current = this.getByName(name);
    if (!current) throw new UserError(`No user "${name}".`);
    this.write({ ...file, users: file.users.filter(user => user.id !== current.id) });
  }

  /** Creates a token for a user and returns it once; only its SHA-256 is stored. */
  createToken(name: string, label: string, expiresInDays?: number): { token: string; record: TokenRecord } {
    const file = this.read();
    const current = this.getByName(name);
    if (!current) throw new UserError(`No user "${name}".`);
    if (!label.trim()) throw new UserError('A token needs a label.');
    const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const record: TokenRecord = {
      id: 'tok_' + randomUUID().slice(0, 8),
      label: label.trim(),
      sha256: hashToken(token),
      createdAt: new Date().toISOString(),
      expires: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null,
    };
    const next = { ...current, tokens: [...current.tokens, record] };
    this.write({ ...file, users: file.users.map(user => (user.id === current.id ? next : user)) });
    return { token, record };
  }

  revokeToken(name: string, tokenId: string): void {
    const file = this.read();
    const current = this.getByName(name);
    if (!current) throw new UserError(`No user "${name}".`);
    if (!current.tokens.some(token => token.id === tokenId)) throw new UserError(`No token "${tokenId}" for ${name}.`);
    const next = { ...current, tokens: current.tokens.filter(token => token.id !== tokenId) };
    this.write({ ...file, users: file.users.map(user => (user.id === current.id ? next : user)) });
  }
}
