/**
 * Slows down password guessing. Failures are counted per key (user name and client address together); after
 * a few misses the key is locked for a time that doubles with every further miss, up to 15 minutes.
 */
export class LoginLimiter {
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly freeAttempts = 5,
    private readonly baseLockMs = 5_000,
    private readonly maxLockMs = 15 * 60_000,
  ) {}

  /** Milliseconds the caller must still wait, or 0 when an attempt is allowed. */
  retryAfter(key: string): number {
    const entry = this.failures.get(key);
    return entry ? Math.max(0, entry.lockedUntil - this.now()) : 0;
  }

  fail(key: string): void {
    const count = (this.failures.get(key)?.count ?? 0) + 1;
    const over = count - this.freeAttempts;
    const lock = over >= 0 ? Math.min(this.maxLockMs, this.baseLockMs * 2 ** over) : 0;
    this.failures.set(key, { count, lockedUntil: this.now() + lock });
    if (this.failures.size > 1000) this.prune();
  }

  succeed(key: string): void {
    this.failures.delete(key);
  }

  private prune(): void {
    const now = this.now();
    for (const [key, entry] of this.failures) if (entry.lockedUntil < now - this.maxLockMs) this.failures.delete(key);
  }
}
