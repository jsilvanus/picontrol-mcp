import { AuditLog } from './audit.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { SqliteAuthStore } from './storage/sqlite.js';
import { createUpstreams } from './upstream.js';
import { UserStore } from './users/store.js';

const config = loadConfig();
const users = new UserStore(config.usersPath);
users.assertSecure();
if (users.list().length === 0) {
  console.warn(`No users in ${config.usersPath}. Create one: npm run user -- add <name> --role admin`);
}
if (!config.publicUrl.startsWith('https://') && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(config.publicUrl)) {
  console.warn('MCP_PUBLIC_URL is plain http on a LAN address. Personal access tokens work; OAuth clients that require https will refuse it.');
}

const store = new SqliteAuthStore(config.statePath);
const app = await buildApp({
  publicUrl: config.publicUrl,
  jwtSecret: config.jwtSecret,
  authMode: config.authMode,
  allowedHosts: config.allowedHosts,
  store,
  users,
  upstreams: createUpstreams(config),
  audit: new AuditLog(config.auditPath),
});

await app.listen({ host: config.host, port: config.port });
