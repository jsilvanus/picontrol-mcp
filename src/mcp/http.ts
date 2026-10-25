import type { IncomingMessage } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { AuditLog } from '../audit.js';
import { verifyBearerToken } from '../auth.js';
import type { AuthMode } from '../config.js';
import type { Upstreams } from '../upstream.js';
import type { Principal, UserStore } from '../users/store.js';
import { createMcpServer } from './server.js';
import type { DomainModule } from './registry.js';

export interface McpHttpOptions {
  publicUrl: string;
  jwtSecret: Uint8Array;
  resource: string;
  authMode: AuthMode;
  users: UserStore;
  upstreams: Upstreams;
  audit: AuditLog;
  /** Host header values (with port) that may reach /mcp. Protects against DNS rebinding. */
  allowedHosts: string[];
  modules?: DomainModule[];
}

export function wwwAuthenticate(publicUrl: string, mode: AuthMode, error?: string): string {
  const metadata = mode === 'token' ? '' : ` resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp", scope="mcp"`;
  const detail = error ? `${metadata ? ',' : ''} error="${error}", error_description="The access token is missing, expired or invalid."` : '';
  return 'Bearer' + metadata + detail;
}

function methodNotAllowed() {
  return { jsonrpc: '2.0' as const, error: { code: -32000, message: 'Method not allowed.' }, id: null };
}

/** Origin and Host must be ones we serve; a web page on another origin cannot reach the LAN server through the browser. */
export function originAllowed(origin: string | undefined, host: string | undefined, allowedHosts: string[]): boolean {
  if (!host || !allowedHosts.includes(host.toLowerCase())) return false;
  if (!origin) return true;
  try {
    return allowedHosts.includes(new URL(origin).host.toLowerCase());
  } catch {
    return false;
  }
}

export async function mountMcpHttp(app: FastifyInstance, options: McpHttpOptions): Promise<void> {
  app.post('/mcp', async (request, reply) => {
    if (!originAllowed(request.headers.origin, request.headers.host, options.allowedHosts)) {
      return reply.code(403).send({ error: 'forbidden_host' });
    }
    const challenge = (error?: string) =>
      reply.code(401).header('WWW-Authenticate', wwwAuthenticate(options.publicUrl, options.authMode, error)).send({ error: error ?? 'unauthorized' });

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return challenge();
    const token = header.slice('Bearer '.length).trim();

    let principal: Principal | undefined;
    let clientId = 'token';
    if (token.startsWith('pcm_')) {
      if (options.authMode === 'oauth') return challenge('invalid_token');
      principal = options.users.findByToken(token);
    } else if (options.authMode !== 'token') {
      try {
        const payload = await verifyBearerToken(token, options.jwtSecret, options.publicUrl, options.resource);
        if (typeof payload.sub === 'string') principal = options.users.principal(payload.sub);
        if (typeof payload.client_id === 'string') clientId = payload.client_id;
      } catch {
        principal = undefined;
      }
    }
    // Permissions come from the users file on every request: a removed or disabled user is refused at once.
    if (!principal) {
      options.audit.write({ event: 'auth.rejected', ip: request.ip });
      return challenge('invalid_token');
    }

    const authInfo: AuthInfo = { token: '', clientId, scopes: ['mcp'], extra: { userId: principal.id } };
    const server = createMcpServer({
      user: principal, upstreams: options.upstreams, audit: options.audit,
      ...(options.modules ? { modules: options.modules } : {}),
    });
    const transport = new StreamableHTTPServerTransport({});
    await server.connect(transport as unknown as Transport);

    reply.hijack();
    reply.raw.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    const rawRequest = request.raw as IncomingMessage & { auth?: AuthInfo };
    rawRequest.auth = authInfo;
    await transport.handleRequest(rawRequest, reply.raw, request.body);
  });

  app.head('/mcp', async (_request, reply) => reply.code(200).send());
  app.get('/mcp', async (_request, reply) => reply.code(405).send(methodNotAllowed()));
  app.delete('/mcp', async (_request, reply) => reply.code(405).send(methodNotAllowed()));
}
