import Fastify, { type FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import type { AuditLog } from './audit.js';
import type { AuthMode } from './config.js';
import { mountMcpHttp } from './mcp/http.js';
import type { DomainModule } from './mcp/registry.js';
import { mountOAuthMetadata } from './oauth-metadata.js';
import { mountAuthorizationServer, type AuthorizationServerOptions } from './oauth/authorization-server.js';
import { LoginLimiter } from './rate-limit.js';
import type { AuthStore } from './storage/interface.js';
import type { Upstreams } from './upstream.js';
import type { UserStore } from './users/store.js';

export interface AppOptions {
  publicUrl: string;
  jwtSecret: Uint8Array;
  authMode: AuthMode;
  allowedHosts: string[];
  store: AuthStore;
  users: UserStore;
  upstreams: Upstreams;
  audit: AuditLog;
  /** Replaceable in tests (CIMD fetch, limiter clock). */
  authorization?: AuthorizationServerOptions;
  modules?: DomainModule[];
  logger?: boolean;
}

/** Builds the Fastify app without listening, so tests can run it on an ephemeral port. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  await app.register(formbody);

  const resource = options.publicUrl + '/mcp';
  if (options.authMode !== 'token') {
    await mountOAuthMetadata(app, options.publicUrl);
    await mountAuthorizationServer(app, options.publicUrl, resource, options.jwtSecret, options.store, options.users, {
      limiter: new LoginLimiter(),
      audit: options.audit,
      ...options.authorization,
    });
  }
  await mountMcpHttp(app, {
    publicUrl: options.publicUrl,
    jwtSecret: options.jwtSecret,
    resource,
    authMode: options.authMode,
    users: options.users,
    upstreams: options.upstreams,
    audit: options.audit,
    allowedHosts: options.allowedHosts,
    ...(options.modules ? { modules: options.modules } : {}),
  });

  app.get('/health', async () => ({ ok: true }));
  return app;
}
