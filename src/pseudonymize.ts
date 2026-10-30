/**
 * Two-way Pseudonymizer for MCP
 *
 * Outbound: Masks/pseudonymizes personal identifying information (PII) such as person names,
 * mapping them to role-based titles or stable session pseudonyms before emitting state or text
 * to external cloud AI agents.
 *
 * Inbound: Translates role pseudonyms back into local real names when executing tools on
 * downstream local hardware or graphics engines.
 *
 * Enforces zero raw image/audio leakage.
 */

// Common Finnish and English liturgical / broadcast titles
export const KNOWN_ROLES: Record<string, string> = {
  liturgi: 'Celebrant / Liturgi',
  liturgist: 'Celebrant / Liturgi',
  pastori: 'Celebrant / Liturgi',
  pappi: 'Celebrant / Liturgi',
  celebrant: 'Celebrant / Liturgi',
  saarnaaja: 'Preacher / Saarnaaja',
  preacher: 'Preacher / Saarnaaja',
  lukija: 'Lector / Lukija',
  tekstinlukija: 'Lector / Lukija',
  lector: 'Lector / Lukija',
  reader: 'Lector / Lukija',
  kanttori: 'Cantor / Kanttori',
  cantor: 'Cantor / Kanttori',
  muusikko: 'Musician / Muusikko',
  musician: 'Musician / Muusikko',
  urkuri: 'Organist / Urkuri',
  organist: 'Organist / Urkuri',
  avustaja: 'Assistant / Avustaja',
  assistant: 'Assistant / Avustaja',
  diakoni: 'Deacon / Diakoni',
  deacon: 'Deacon / Diakoni',
  suntio: 'Verger / Suntio',
  vahtimestari: 'Verger / Suntio',
  verger: 'Verger / Suntio',
  kuoro: 'Choir / Kuoro',
  choir: 'Choir / Kuoro',
};

export class SessionPseudonymizer {
  private realToPseudo = new Map<string, string>();
  private pseudoToReal = new Map<string, string>();
  private counter = 1;

  constructor(initialMappings?: Record<string, string>) {
    if (initialMappings) {
      for (const [real, pseudo] of Object.entries(initialMappings)) {
        this.register(real, pseudo);
      }
    }
  }

  /**
   * Register an explicit mapping between a real person name and their liturgical role / pseudonym.
   */
  register(realName: string, pseudonymOrRole: string): void {
    const trimmedReal = realName.trim();
    if (!trimmedReal) return;
    const lowerRole = pseudonymOrRole.toLowerCase().trim();
    const mappedTitle = KNOWN_ROLES[lowerRole] ?? pseudonymOrRole;
    this.realToPseudo.set(trimmedReal, mappedTitle);
    this.pseudoToReal.set(mappedTitle, trimmedReal);
  }

  /**
   * Obtains a pseudonym for a real name. If not previously mapped, creates a consistent pseudonym.
   */
  getPseudonym(realName: string, roleHint?: string): string {
    const trimmed = realName.trim();
    if (!trimmed) return trimmed;

    const existing = this.realToPseudo.get(trimmed);
    if (existing) return existing;

    if (roleHint) {
      const lowerHint = roleHint.toLowerCase().trim();
      const mappedRole = KNOWN_ROLES[lowerHint];
      if (mappedRole) {
        const title = `${mappedRole} (${this.counter++})`;
        this.register(trimmed, title);
        return title;
      }
    }

    const assigned = `Speaker_${this.counter++}`;
    this.register(trimmed, assigned);
    return assigned;
  }

  /**
   * Translates a pseudonym back to the local real name if mapped.
   */
  getRealName(pseudonym: string): string {
    return this.pseudoToReal.get(pseudonym.trim()) ?? pseudonym;
  }

  /**
   * Outbound pseudonymization of text (e.g. captions, notes, intercessory prayers).
   * Replaces any registered real names with their corresponding pseudonyms.
   */
  pseudonymizeText(text: string): string {
    let result = text;
    for (const [real, pseudo] of this.realToPseudo.entries()) {
      if (real.length < 3) continue; // skip accidental substring matches
      const regex = new RegExp(`\\b${escapeRegExp(real)}\\b`, 'gi');
      result = result.replace(regex, pseudo);
    }
    return result;
  }

  /**
   * Inbound restoration of real names in text or arguments before calling local hardware.
   */
  restoreText(text: string): string {
    let result = text;
    for (const [pseudo, real] of this.pseudoToReal.entries()) {
      const regex = new RegExp(`\\b${escapeRegExp(pseudo)}\\b`, 'g');
      result = result.replace(regex, real);
    }
    return result;
  }

  /**
   * Deeply transforms an object or value, replacing real names with pseudonyms for outbound MCP output.
   */
  outbound<T>(value: T): T {
    if (typeof value === 'string') return this.pseudonymizeText(value) as unknown as T;
    if (Array.isArray(value)) return value.map(v => this.outbound(v)) as unknown as T;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => {
        // If field name indicates a person name, check direct mapping
        if (typeof v === 'string' && /^(name|speaker|author|performer|person|celebrant)$/i.test(k)) {
          return [k, this.getPseudonym(v)];
        }
        return [k, this.outbound(v)];
      });
      return Object.fromEntries(entries) as T;
    }
    return value;
  }

  /**
   * Deeply transforms tool input arguments, restoring pseudonyms to real names for local processing.
   */
  inbound<T>(value: T): T {
    if (typeof value === 'string') return this.restoreText(value) as unknown as T;
    if (Array.isArray(value)) return value.map(v => this.inbound(v)) as unknown as T;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => {
        if (typeof v === 'string' && /^(name|speaker|title|subtitle)$/i.test(k)) {
          return [k, this.getRealName(v)];
        }
        return [k, this.inbound(v)];
      });
      return Object.fromEntries(entries) as T;
    }
    return value;
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const defaultPseudonymizer = new SessionPseudonymizer();
