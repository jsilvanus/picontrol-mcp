import { defineTool, type DomainContext, type DomainModule } from '../mcp/registry.js';
import { describeError } from '../upstream.js';
import { describeRights } from '../users/permissions.js';
import { json } from './util.js';
import { HELP } from './help.js';

const read = { domain: 'system', level: 'read' } as const;

async function probe<T>(task: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try { return { ok: true, data: await task() }; } catch (error) { return { ok: false, error: describeError(error) }; }
}

export function systemStatus(ctx: DomainContext) {
  const { pimatrix, pivoice } = ctx.upstreams;
  return Promise.all([
    pimatrix ? probe(async () => ({ status: await pimatrix.system.getStatus(), ready: await pimatrix.system.getReadiness() })) : undefined,
    pivoice ? probe(() => pivoice.system.getStatus()) : undefined,
  ]).then(([matrix, voice]) => ({
    pimatrix: matrix ?? { configured: false },
    pivoice: voice ?? { configured: false },
  }));
}

export const system: DomainModule = {
  resources: [
    {
      name: 'status', uri: 'pi://status', title: 'Pi system status',
      description: 'Health of the Pi services in one read: pimatrix (status, readiness) and pivoice. A service that is down shows its error instead of failing the read.',
      permission: read, upstream: null,
      read: async ctx => json(await systemStatus(ctx)),
    },
    {
      name: 'help-domains', uri: 'pi://help/domains', title: 'Guide to the tool groups',
      description: 'What each tool group is for, in which order to use them, and safety rules for a live service. Read this once at the start.',
      permission: read, upstream: null,
      read: async () => ({ text: HELP, mimeType: 'text/markdown' }),
    },
  ],
  tools: [
    defineTool({
      name: 'system_whoami', title: 'Who am I',
      description: 'Shows who the caller is, their role, what they may do in each tool group, and which services this server can reach. Use it to understand why a tool is missing.',
      permission: read, upstream: null, effect: 'read', idempotent: true, input: {},
      run: async (_args, ctx) => ({
        user: ctx.user.name, displayName: ctx.user.displayName, role: ctx.user.role,
        ...(ctx.user.tokenLabel ? { accessToken: ctx.user.tokenLabel } : {}),
        permissions: describeRights(ctx.user.rights),
        services: { pimatrix: Boolean(ctx.upstreams.pimatrix), pivoice: Boolean(ctx.upstreams.pivoice) },
      }),
    }),
  ],
};
