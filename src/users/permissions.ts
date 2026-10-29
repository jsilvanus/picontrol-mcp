export const DOMAINS = ['routing', 'cameras', 'atem', 'program', 'composites', 'voice', 'youtube', 'tally', 'radio', 'encoder', 'system'] as const;
export type Domain = (typeof DOMAINS)[number];

export const LEVELS = ['read', 'write', 'admin'] as const;
export type Level = (typeof LEVELS)[number];

export interface Permission {
  domain: Domain;
  level: Level;
}

const RANK: Record<Level, number> = { read: 1, write: 2, admin: 3 };

/** Permissions are written `domain:level`; `*` stands for every domain. */
export type PermissionText = string;

export const BUILT_IN_ROLES: Record<string, PermissionText[]> = {
  viewer: ['*:read'],
  operator: ['*:write'],
  admin: ['*:admin'],
};

export function parsePermission(text: string): { domain: Domain | '*'; level: Level } {
  const [domain, level, extra] = text.split(':');
  if (extra !== undefined || !domain || !level) throw new Error(`Invalid permission "${text}" (expected domain:level)`);
  if (domain !== '*' && !(DOMAINS as readonly string[]).includes(domain)) {
    throw new Error(`Unknown permission domain "${domain}" (known: ${DOMAINS.join(', ')}, *)`);
  }
  if (!(LEVELS as readonly string[]).includes(level)) {
    throw new Error(`Unknown permission level "${level}" (known: ${LEVELS.join(', ')})`);
  }
  return { domain: domain as Domain | '*', level: level as Level };
}

export interface PermissionSource {
  role: string;
  extraGrants: PermissionText[];
  extraDenies: PermissionText[];
}

/** What a user may do, per domain: 0 = nothing, 1 = read, 2 = write, 3 = admin. */
export type EffectiveRights = Record<Domain, number>;

export function effectiveRights(
  source: PermissionSource,
  roles: Record<string, PermissionText[]> = BUILT_IN_ROLES,
): EffectiveRights {
  const rights = Object.fromEntries(DOMAINS.map(domain => [domain, 0])) as EffectiveRights;
  const grants = [...(roles[source.role] ?? []), ...source.extraGrants];
  for (const text of grants) {
    const grant = parsePermission(text);
    for (const domain of DOMAINS) {
      if (grant.domain === '*' || grant.domain === domain) rights[domain] = Math.max(rights[domain], RANK[grant.level]);
    }
  }
  // A deny of domain:level removes that level and every level above it, never the ones below.
  for (const text of source.extraDenies) {
    const deny = parsePermission(text);
    for (const domain of DOMAINS) {
      if (deny.domain === '*' || deny.domain === domain) rights[domain] = Math.min(rights[domain], RANK[deny.level] - 1);
    }
  }
  return rights;
}

export function allows(rights: EffectiveRights, permission: Permission): boolean {
  return rights[permission.domain] >= RANK[permission.level];
}

export function describeRights(rights: EffectiveRights): Record<string, Level | 'none'> {
  const names: Array<Level | 'none'> = ['none', 'read', 'write', 'admin'];
  return Object.fromEntries(DOMAINS.map(domain => [domain, names[rights[domain]] ?? 'none']));
}
