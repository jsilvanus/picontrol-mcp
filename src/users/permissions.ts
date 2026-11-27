export const DOMAINS = [
  'routing', 'cameras', 'atem', 'program', 'composites', 'voice', 'youtube',
  'tally', 'radio', 'encoder', 'system',
  'world', 'space', 'perception', 'sound', 'rundown', 'graphics', 'designer',
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
  director: [
    'cameras:operate',
    'atem:operate',
    'program:operate',
    'composites:operate',
    'tally:operate',
    'rundown:operate',
    'graphics:operate',
    'designer:operate',
    'perception:view',
    'space:view',
    'voice:view',
    'sound:view',
    'routing:view',
    'system:read',
    '*:read',
  ],
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

const MODULE_TO_DOMAIN: Record<string, Domain> = {
  matrix: 'routing',
  piswitch: 'routing',
  routing: 'routing',
  cameras: 'cameras',
  picam: 'cameras',
  atem: 'atem',
  program: 'program',
  piprogram: 'program',
  composites: 'composites',
  voice: 'voice',
  pivoice: 'voice',
  youtube: 'youtube',
  pitube: 'youtube',
  tally: 'tally',
  pitally: 'tally',
  radio: 'radio',
  piradio: 'radio',
  encoder: 'encoder',
  piencoder: 'encoder',
  system: 'system',
  world: 'world',
  space: 'space',
  pispace: 'space',
  perception: 'perception',
  piperception: 'perception',
  sound: 'sound',
  pisound: 'sound',
  rundown: 'rundown',
  pirundown: 'rundown',
  graphics: 'graphics',
  pigraphics: 'graphics',
  designer: 'designer',
  'rundown-designer': 'designer',
  'pirundown-designer': 'designer',
};

/**
 * Maps a single right string like `*:admin`, `cameras:operate`, `picam:read` to permission text(s).
 */
export function normalizeRight(right: string): PermissionText[] {
  const [target, level] = right.split(':');
  if (!target || !level) return [];
  const normalizedLevel = level === 'operate' ? 'operate' : level === 'view' ? 'read' : level;
  if (!(LEVELS as readonly string[]).includes(normalizedLevel as Level)) return [];

  if (target === '*') {
    return [`*:${normalizedLevel}`];
  }
  const domain = MODULE_TO_DOMAIN[target];
  if (domain) {
    return [`${domain}:${normalizedLevel}`];
  }
  return [];
}

/**
 * Resolves a Tunnus group string into internal permission grants / roles.
 * Supported patterns:
 * 1. Preset or role directly: `@admin`, `@operator`, `@viewer`, `@content`, `admin`, `operator`, `viewer`, `director`, etc.
 * 2. `parish/<tenant>/<application>-<role level>` (e.g. `parish/riihimaki/picontrol-operator`, `parish/riihimaki/cameras-write`, `parish/riihimaki/picam-admin`)
 * 3. `parish/<tenant>/<application>:<level>` (e.g. `parish/riihimaki/picontrol:admin`, `parish/riihimaki/cameras:operate`)
 * 4. `<module>:<level>` directly (e.g. `cameras:operate`, `*:read`)
 * 5. Configured custom mapping table if provided.
 */
export function grantsForTunnusGroup(
  group: string,
  customMapping?: Map<string, string[]> | Record<string, string[]>,
): PermissionText[] {
  const trimmed = group.trim();
  if (!trimmed) return [];

  // Check custom mapping first
  if (customMapping) {
    const custom = customMapping instanceof Map ? customMapping.get(trimmed) : customMapping[trimmed];
    if (custom) {
      return custom.flatMap(normalizeRight);
    }
  }

  // Preset mapping (@admin, @operator, @viewer, @content)
  const PRESET_EXPANSIONS: Record<string, string[]> = {
    '@admin': ['*:admin'],
    '@operator': ['*:write'],
    '@viewer': ['*:read'],
    '@content': ['program:write', 'graphics:write', 'rundown:write', 'designer:write'],
  };
  if (PRESET_EXPANSIONS[trimmed]) {
    return PRESET_EXPANSIONS[trimmed]!.flatMap(normalizeRight);
  }

  // Built-in role directly
  if (BUILT_IN_ROLES[trimmed]) {
    return BUILT_IN_ROLES[trimmed]!;
  }

  // Direct right: `<module>:<level>`
  if (trimmed.includes(':') && !trimmed.startsWith('parish/')) {
    return normalizeRight(trimmed);
  }

  // Parish tenant paths: parish/<tenant>/<app-or-module>[-|:]<level>
  // e.g. parish/riihimaki/picontrol-operator
  // e.g. parish/riihimaki/picontrol:admin
  // e.g. parish/riihimaki/cameras-write
  // e.g. parish/riihimaki/picam-admin
  const parishMatch = trimmed.match(/^parish\/[^/]+\/(.+)$/);
  if (parishMatch) {
    const tail = parishMatch[1]!;

    // Check if tail is a preset or direct right or app-level
    if (PRESET_EXPANSIONS[tail]) {
      return PRESET_EXPANSIONS[tail]!.flatMap(normalizeRight);
    }
    if (BUILT_IN_ROLES[tail]) {
      return BUILT_IN_ROLES[tail]!;
    }

    // Split on ':' or '-'
    let app = '';
    let level = '';
    if (tail.includes(':')) {
      const idx = tail.indexOf(':');
      app = tail.slice(0, idx);
      level = tail.slice(idx + 1);
    } else if (tail.includes('-')) {
      const idx = tail.lastIndexOf('-');
      app = tail.slice(0, idx);
      level = tail.slice(idx + 1);
    }

    if (app && level) {
      // If the app refers to the entire picontrol application or wildcard:
      if (app === 'picontrol' || app === 'mcp' || app === 'picontrol-mcp' || app === '*') {
        if (BUILT_IN_ROLES[level]) {
          return BUILT_IN_ROLES[level]!;
        }
        if (level === 'operator' || level === 'operate') return ['*:write'];
        if (level === 'viewer' || level === 'view') return ['*:read'];
        if ((LEVELS as readonly string[]).includes(level as Level)) {
          return [`*:${level}`];
        }
      } else {
        // App is a domain or module name (e.g. 'cameras', 'picam', 'routing')
        return normalizeRight(`${app}:${level}`);
      }
    }
  }

  return [];
}

/**
 * Computes EffectiveRights from a list of Tunnus groups.
 */
export function rightsForTunnusGroups(
  groups: readonly string[],
  customMapping?: Map<string, string[]> | Record<string, string[]>,
): { rights: EffectiveRights; role: string; grants: PermissionText[] } {
  const allGrants = new Set<PermissionText>();

  for (const group of groups) {
    const grants = grantsForTunnusGroup(group, customMapping);
    for (const g of grants) {
      allGrants.add(g);
    }
  }

  const grantsList = [...allGrants];
  const effective = effectiveRights({
    role: '',
    extraGrants: grantsList,
    extraDenies: [],
  });

  let highestRole = 'viewer';
  const domainValues = Object.values(effective);
  if (domainValues.some(v => v === 3)) {
    highestRole = 'admin';
  } else if (domainValues.some(v => v === 2)) {
    highestRole = 'operator';
  } else if (domainValues.some(v => v === 1)) {
    highestRole = 'viewer';
  }

  return {
    rights: effective,
    role: highestRole,
    grants: grantsList,
  };
}
