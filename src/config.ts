import { homedir } from 'node:os';
import { join } from 'node:path';

export type AuthMode = 'oauth' | 'token' | 'both';

export interface UpstreamConfig {
  url: string;
  secret?: string;
}

export interface Config {
  host: string;
  port: number;
  publicUrl: string;
  jwtSecret: Uint8Array;
  authMode: AuthMode;
  usersPath: string;
  statePath: string;
  auditPath: string;
  allowedHosts: string[];
  pimatrix?: UpstreamConfig;
  pivoice?: UpstreamConfig;
}

type Env = Record<string, string | undefined>;

/** An upstream URL of "off" or "" switches its domain off. */
function upstream(env: Env, urlName: string, secretName: string, fallback: string): UpstreamConfig | undefined {
  const raw = env[urlName] ?? fallback;
  if (raw === '' || raw.toLowerCase() === 'off') return undefined;
  const secret = env[secretName];
  return { url: raw.replace(/\/$/, ''), ...(secret ? { secret } : {}) };
}

export function loadConfig(env: Env = process.env): Config {
  const port = Number(env.PORT ?? '3200');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('Invalid PORT: ' + env.PORT);
  const host = env.HOST ?? '127.0.0.1';
  const publicUrl = (env.MCP_PUBLIC_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, '');

  const secretText = env.JWT_SECRET;
  if (!secretText) throw new Error('JWT_SECRET is required (generate one with: npm run user -- secret)');
  const jwtSecret = Buffer.from(secretText, 'base64');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must decode to at least 32 bytes');

  const authMode = (env.AUTH_MODE ?? 'both') as AuthMode;
  if (!['oauth', 'token', 'both'].includes(authMode)) throw new Error('AUTH_MODE must be oauth, token or both');

  const configHome = env.PICONTROL_MCP_CONFIG_DIR ?? join(homedir(), '.config', 'picontrol-mcp');
  const stateHome = env.PICONTROL_MCP_STATE_DIR ?? join(homedir(), '.local', 'state', 'picontrol-mcp');

  const publicHost = new URL(publicUrl).host;
  const allowedHosts = [...new Set([
    publicHost, `127.0.0.1:${port}`, `localhost:${port}`,
    ...(env.MCP_ALLOWED_HOSTS ?? '').split(',').map(entry => entry.trim()).filter(Boolean),
  ])];

  const pimatrix = upstream(env, 'PIMATRIX_URL', 'PIMATRIX_API_KEY', 'http://127.0.0.1:3000');
  const pivoice = upstream(env, 'PIVOICE_URL', 'PIVOICE_API_TOKEN', 'http://127.0.0.1:8095');

  return {
    host, port, publicUrl, jwtSecret, authMode, allowedHosts,
    usersPath: env.USERS_PATH ?? join(configHome, 'users.json'),
    statePath: env.STATE_PATH ?? join(stateHome, 'state.sqlite'),
    auditPath: env.AUDIT_PATH ?? join(stateHome, 'audit.log'),
    ...(pimatrix ? { pimatrix } : {}),
    ...(pivoice ? { pivoice } : {}),
  };
}
