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
  pitube?: UpstreamConfig;
  pitally?: UpstreamConfig;
  radio?: UpstreamConfig;
  encoder?: UpstreamConfig;
  pigateway?: UpstreamConfig;
  pispace?: UpstreamConfig;
  piperception?: UpstreamConfig;
  pisound?: UpstreamConfig;
  pirundown?: UpstreamConfig;
  pigraphics?: UpstreamConfig;
  pirundownDesigner?: UpstreamConfig;
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
  const port = Number(env.PORT ?? '3600');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('Invalid PORT: ' + env.PORT);
  const host = env.HOST ?? '127.0.0.1';
  const publicUrl = (env.MCP_PUBLIC_URL ?? `http://127.0.0.1:${port}`).replace(/\/+$/, '').replace(/\/mcp$/, '');

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

  const pimatrix = upstream(env, 'PIMATRIX_URL', 'PIMATRIX_API_KEY', 'http://127.0.0.1:3101');
  const pivoice = upstream(env, 'PIVOICE_URL', 'PIVOICE_API_TOKEN', 'http://127.0.0.1:3106');
  const pitube = upstream(env, 'PITUBE_URL', 'PITUBE_API_KEY', 'http://127.0.0.1:3500');
  const pitally = upstream(env, 'PITALLY_URL', 'PITALLY_API_KEY', 'http://127.0.0.1:3107');
  const radio = upstream(env, 'RADIO_URL', 'RADIO_API_TOKEN', 'http://127.0.0.1:3100');
  const encoder = upstream(env, 'ENCODER_URL', 'ENCODER_API_KEY', env.PIMATRIX_URL ?? 'http://127.0.0.1:3101');
  const pigateway = upstream(env, 'PIGATEWAY_URL', 'PIGATEWAY_API_KEY', 'http://127.0.0.1:3000');
  const pispace = upstream(env, 'PISPACE_URL', 'PISPACE_API_KEY', 'http://127.0.0.1:3203');
  const piperception = upstream(env, 'PIPERCEPTION_URL', 'PIPERCEPTION_API_KEY', 'http://127.0.0.1:3202');
  const pisound = upstream(env, 'PISOUND_URL', 'PISOUND_API_KEY', 'http://127.0.0.1:3105');
  const pirundown = upstream(env, 'PIRUNDOWN_URL', 'PIRUNDOWN_API_KEY', 'http://127.0.0.1:3400');
  const pigraphics = upstream(env, 'PIGRAPHICS_URL', 'PIGRAPHICS_API_KEY', 'http://127.0.0.1:3201');
  const pirundownDesigner = upstream(env, 'PIRUNDOWN_DESIGNER_URL', 'PIRUNDOWN_DESIGNER_API_KEY', 'http://127.0.0.1:3610');

  return {
    host, port, publicUrl, jwtSecret, authMode, allowedHosts,
    usersPath: env.USERS_PATH ?? join(configHome, 'users.json'),
    statePath: env.STATE_PATH ?? join(stateHome, 'state.sqlite'),
    auditPath: env.AUDIT_PATH ?? join(stateHome, 'audit.log'),
    ...(pimatrix ? { pimatrix } : {}),
    ...(pivoice ? { pivoice } : {}),
    ...(pitube ? { pitube } : {}),
    ...(pitally ? { pitally } : {}),
    ...(radio ? { radio } : {}),
    ...(encoder ? { encoder } : {}),
    ...(pigateway ? { pigateway } : {}),
    ...(pispace ? { pispace } : {}),
    ...(piperception ? { piperception } : {}),
    ...(pisound ? { pisound } : {}),
    ...(pirundown ? { pirundown } : {}),
    ...(pigraphics ? { pigraphics } : {}),
    ...(pirundownDesigner ? { pirundownDesigner } : {}),
  };
}
