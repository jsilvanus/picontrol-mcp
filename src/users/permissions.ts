export const DOMAINS = [
  'routing', 'cameras', 'atem', 'program', 'composites', 'voice', 'youtube',
  'tally', 'radio', 'encoder', 'system',
  'world', 'space', 'perception', 'sound', 'rundown', 'graphics',
] as const;
export type Domain = (typeof DOMAINS)[number];

export const LEVELS = ['read', 'write', 'admin', 'view', 'operate', 'config', 'setup'] as const;
export type Level = (typeof LEVELS)[number];

export const SCOPES = ['church', 'stream', 'radio', 'event', 'hardware'] as const;
export type Scope = (typeof SCOPES)[number];

export interface Permission {
  domain: Domain;
  level: Level;
  scope?: Scope | Scope[];
}

export type PermissionText = string;

export const BUILT_IN_ROLES: Record<string, PermissionText[]> = {
  viewer: ['*:read'],
  view: ['*:read'],
  operator: ['*:write'],
  operate: ['*:write'],
  config: ['*:config'],
  setup: ['*:setup'],
  admin: ['*:admin'],
};

// Numeric level representations:
// 1 = read/view
// 2 = write/operate
// 3 = admin
// 6 = config
// 7 = setup
export const RANK: Record<Level, number> = {
  read: 1,
  view: 1,
  write: 2,
  operate: 2,
  admin: 3,
  config: 6,
  setup: 7,
};

export function parsePermission(text: string): { domain: Domain | '*'; level: Level } {
  const [domain, level, extra] = text.split(':');
  if (extra !== undefined || !domain || !level) throw new Error(`Invalid permission "${text}" (expected domain:level)`);
  if (domain !== '*' && !(DOMAINS as readonly string[]).includes(domain as Domain)) {
    throw new Error(`Unknown permission domain "${domain}" (known: ${DOMAINS.join(', ')}, *)`);
  }
  if (!(LEVELS as readonly string[]).includes(level as Level)) {
    throw new Error(`Unknown permission level "${level}" (known: ${LEVELS.join(', ')})`);
  }
  return { domain: domain as Domain | '*', level: level as Level };
}

export interface PermissionSource {
  role: string;
  extraGrants: PermissionText[];
  extraDenies: PermissionText[];
  scopes?: string[];
}

/** What a user may do per domain: 0 = none, 1 = read, 2 = write, 3 = admin, 6 = config, 7 = setup. */
export type EffectiveRights = Record<Domain, number>;

export function effectiveRights(
  source: PermissionSource,
  roles: Record<string, PermissionText[]> = BUILT_IN_ROLES,
): EffectiveRights {
  const rights = Object.fromEntries(DOMAINS.map(domain => [domain, 0])) as EffectiveRights;
  const grants = [...(roles[source.role] ?? []), ...source.extraGrants];
  for (const text of grants) {
    const grant = parsePermission(text);
    const targetRank = RANK[grant.level];
    for (const domain of DOMAINS) {
      if (grant.domain === '*' || grant.domain === domain) {
        if (targetRank === 3) {
          rights[domain] = 3; // admin
        } else if (rights[domain] !== 3) {
          rights[domain] = Math.max(rights[domain], targetRank);
        }
      }
    }
  }

  // Denies:
  // write/operate deny removes write, setup, and admin above it
  for (const text of source.extraDenies) {
    const deny = parsePermission(text);
    const denyRank = RANK[deny.level];
    for (const domain of DOMAINS) {
      if (deny.domain === '*' || deny.domain === domain) {
        if (denyRank === 1) {
          rights[domain] = 0;
        } else if (denyRank === 2) {
          // Denying write removes write (2), admin (3), and setup (7), leaving read (1)
          if (rights[domain] >= 2) rights[domain] = 1;
        } else if (denyRank === 3) {
          // Denying admin drops to write (2)
          if (rights[domain] === 3) rights[domain] = 2;
        } else if (denyRank === 7) {
          // Denying setup removes setup (7) and admin (3)
          if (rights[domain] === 7 || rights[domain] === 3) rights[domain] = 2;
        } else if (denyRank === 6) {
          // Denying config removes config (6)
          if (rights[domain] === 6) rights[domain] = 1;
        }
      }
    }
  }
  return rights;
}

export function allows(rights: EffectiveRights, permission: Permission, userScopes?: string[]): boolean {
  const current = rights[permission.domain] ?? 0;
  if (current === 0) return false;

  const reqLevel = permission.level;
  let allowed = false;

  if (reqLevel === 'read' || reqLevel === 'view') {
    allowed = current >= 1;
  } else if (reqLevel === 'write' || reqLevel === 'operate') {
    allowed = current === 2 || current === 3; // operator and admin, NOT setup (7) and NOT config (6)
  } else if (reqLevel === 'setup') {
    allowed = current === 7 || current === 3; // setup and admin, NOT operator (2)
  } else if (reqLevel === 'config') {
    allowed = current === 6 || current === 3; // config and admin
  } else if (reqLevel === 'admin') {
    allowed = current === 3; // admin only
  }

  if (!allowed) return false;

  if (permission.scope && userScopes && !userScopes.includes('*')) {
    const required = Array.isArray(permission.scope) ? permission.scope : [permission.scope];
    const match = required.some(s => userScopes.includes(s));
    if (!match) return false;
  }

  return true;
}

export function describeRights(rights: EffectiveRights): Record<string, string> {
  const names: Record<number, string> = {
    0: 'none',
    1: 'read',
    2: 'write',
    3: 'admin',
    6: 'config',
    7: 'setup',
  };
  return Object.fromEntries(DOMAINS.map(domain => [domain, names[rights[domain]] ?? 'none']));
}
