import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AuditLog } from '../src/audit.js';
import { buildApp, type AppOptions } from '../src/app.js';
import { SqliteAuthStore } from '../src/storage/sqlite.js';
import { createUpstreams } from '../src/upstream.js';
import { UserStore } from '../src/users/store.js';

export interface RecordedCall { method: string; url: string; body: unknown; authorization: string | undefined }
type Responder = (call: RecordedCall) => { status?: number; body: unknown } | undefined;

/** A tiny fake upstream: records every call and answers from `responder` (or with {}). */
export async function fakeUpstream(responder: Responder = () => undefined) {
  const calls: RecordedCall[] = [];
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString();
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : undefined; } catch { /* keep text */ }
    const call: RecordedCall = { method: req.method ?? 'GET', url: req.url ?? '', body, authorization: req.headers.authorization };
    calls.push(call);
    const answer = responder(call) ?? { body: {} };
    res.writeHead(answer.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer.body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '';
  return { url, calls, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

export interface Harness {
  app: FastifyInstance;
  base: string;
  dir: string;
  users: UserStore;
  auditPath: string;
  close: () => Promise<void>;
}

export async function startHarness(options: {
  pimatrixUrl?: string; pivoiceUrl?: string;
  authMode?: AppOptions['authMode'];
  authorization?: AppOptions['authorization'];
} = {}): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'picontrol-mcp-'));
  const users = new UserStore(join(dir, 'users.json'));
  const auditPath = join(dir, 'audit.log');
  const allowedHosts: string[] = [];
  const app = await buildApp({
    publicUrl: 'http://127.0.0.1',
    jwtSecret: randomBytes(32),
    authMode: options.authMode ?? 'both',
    allowedHosts,
    store: new SqliteAuthStore(join(dir, 'state.sqlite')),
    users,
    upstreams: createUpstreams({
      ...(options.pimatrixUrl ? { pimatrix: { url: options.pimatrixUrl, secret: 'pimatrix-secret-key' } } : {}),
      ...(options.pivoiceUrl ? { pivoice: { url: options.pivoiceUrl, secret: 'pivoice-secret-token' } } : {}),
    }),
    audit: new AuditLog(auditPath),
    logger: false,
    ...(options.authorization ? { authorization: options.authorization } : {}),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  allowedHosts.push(`127.0.0.1:${port}`);
  return {
    app, base: `http://127.0.0.1:${port}`, dir, users, auditPath,
    close: async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}
