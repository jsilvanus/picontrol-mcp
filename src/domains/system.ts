import { defineTool, requireClient, type DomainContext, type DomainModule } from '../mcp/registry.js';
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
    {
      name: 'modules', uri: 'pi://modules', title: 'Module toggle state',
      description: 'Returns which UI modules are currently enabled on the gateway. When restricted is false, all modules are available. Use this to understand what is remotely controllable.',
      permission: read, upstream: 'pigateway' as const,
      read: async ctx => {
        const gw = requireClient(ctx, 'pigateway');
        return json(await gw.getUiModules());
      },
    },
    {
      name: 'ecosystem', uri: 'pi://ecosystem', title: 'Ecosystem health',
      description: 'Health and activity status of all modules in the Pi ecosystem: which are active, available, configured, and when last seen.',
      permission: read, upstream: 'pigateway' as const,
      read: async ctx => {
        const gw = requireClient(ctx, 'pigateway');
        return json(await gw.getEcosystem());
      },
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
    defineTool({
      name: 'get_module_toggles', title: 'Get module toggles',
      description: 'Returns which UI modules are enabled on the gateway (the PIGATEWAY_UI_MODULES setting). When restricted is false, all modules are available. Useful for understanding what can be remotely controlled.',
      permission: read, upstream: 'pigateway', effect: 'read', idempotent: true, input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pigateway').getUiModules(),
    }),
  ],
};
