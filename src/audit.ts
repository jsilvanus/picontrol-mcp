import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_BYTES = 5 * 1024 * 1024;

export interface AuditEntry {
  event: string;
  user?: string | undefined;
  [key: string]: unknown;
}

/** Append-only JSON lines. Arguments must be redacted before they are passed in. */
export class AuditLog {
  constructor(private readonly path: string | undefined) {
    if (path) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }

  write(entry: AuditEntry): void {
    if (!this.path) return;
    try {
      try {
        if (statSync(this.path).size > MAX_BYTES) renameSync(this.path, this.path + '.1');
      } catch { /* no file yet */ }
      appendFileSync(this.path, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 });
    } catch (error) {
      console.error('audit log write failed:', (error as Error).message);
    }
  }
}
