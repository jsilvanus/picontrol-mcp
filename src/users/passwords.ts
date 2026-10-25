import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt from node:crypto: no native module to build on the Pi. Parameters are stored in the hash string,
// so they can be raised later while old hashes keep verifying.
const DEFAULT_PARAMS = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MIN_LENGTH = 12;

export const MIN_PASSWORD_LENGTH = MIN_LENGTH;

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = { ...params, maxmem: 256 * params.N * params.r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export function checkPasswordPolicy(password: string): string | undefined {
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  return undefined;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, DEFAULT_PARAMS);
  const { N, r, p } = DEFAULT_PARAMS;
  return `scrypt$N=${N},r=${r},p=${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

function parseHash(stored: string) {
  const [scheme, paramText, saltText, keyText, extra] = stored.split('$');
  if (scheme !== 'scrypt' || !paramText || !saltText || !keyText || extra !== undefined) return undefined;
  const values = Object.fromEntries(paramText.split(',').map(part => part.split('=') as [string, string]));
  const N = Number(values.N), r = Number(values.r), p = Number(values.p);
  if (![N, r, p].every(Number.isInteger) || N < 2 || N > 2 ** 20) return undefined;
  return { params: { N, r, p }, salt: Buffer.from(saltText, 'base64'), key: Buffer.from(keyText, 'base64') };
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const key = await derive(password, parsed.salt, parsed.params);
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

/** True when the stored hash uses weaker parameters than the current defaults. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  return !parsed || parsed.params.N < DEFAULT_PARAMS.N || parsed.params.r < DEFAULT_PARAMS.r;
}

let dummyHash: Promise<string> | undefined;

/** Verifies against a throwaway hash, so an unknown user name costs the same time as a wrong password. */
export async function burnVerification(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-password');
  await verifyPassword(await dummyHash, password);
}
