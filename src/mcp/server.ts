import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuditLog } from '../audit.js';
import { atem } from '../domains/atem.js';
import { cameras } from '../domains/cameras.js';
import { composites } from '../domains/composites.js';
import { program } from '../domains/program.js';
import { routing } from '../domains/routing.js';
import { system } from '../domains/system.js';
import { voiceDomain } from '../domains/voice.js';
import { youtubeDomain } from '../domains/youtube.js';
import { tallyDomain } from '../domains/tally.js';
import { radioDomain } from '../domains/radio.js';
import { encoderDomain } from '../domains/encoder.js';
import { worldDomain } from '../domains/world.js';
import { spaceDomain } from '../domains/space.js';
import { perceptionDomain } from '../domains/perception.js';
import { soundDomain } from '../domains/sound.js';
import { rundownDomain } from '../domains/rundown.js';
import { graphicsDomain } from '../domains/graphics.js';
import { designerDomain } from '../domains/designer.js';
import { defaultPseudonymizer } from '../pseudonymize.js';
import { redact } from '../redact.js';
import { describeError, type Upstreams } from '../upstream.js';
import type { Principal } from '../users/store.js';
import { annotations, canUse, type DomainContext, type DomainModule, type ResourceBody, type ToolDefinition } from './registry.js';

/**
 * Named domain modules — the canonical list. `name` maps to piecosystem repo names
 * via GATEWAY_MODULE_TO_DOMAIN_NAMES below.
 */
export const NAMED_DOMAIN_MODULES: ReadonlyArray<{ name: string; module: DomainModule }> = [
  { name: 'system',     module: system },
  { name: 'routing',    module: routing },
  { name: 'cameras',    module: cameras },
  { name: 'atem',       module: atem },
  { name: 'program',    module: program },
  { name: 'composites', module: composites },
  { name: 'voice',      module: voiceDomain },
  { name: 'youtube',    module: youtubeDomain },
  { name: 'tally',      module: tallyDomain },
  { name: 'radio',      module: radioDomain },
  { name: 'encoder',    module: encoderDomain },
  { name: 'world',      module: worldDomain },
  { name: 'space',      module: spaceDomain },
  { name: 'perception', module: perceptionDomain },
  { name: 'sound',      module: soundDomain },
  { name: 'rundown',    module: rundownDomain },
  { name: 'graphics',   module: graphicsDomain },
  { name: 'designer',   module: designerDomain },
];

export const DOMAIN_MODULES: DomainModule[] = NAMED_DOMAIN_MODULES.map(n => n.module);

/**
 * Maps piecosystem repo names (as used in PIGATEWAY_UI_MODULES) to the MCP
 * domain names they enable. Each key is a repo name from jsilvanus/piecosystem.
 * Domains not listed here are always-on (see ALWAYS_ON_DOMAIN_NAMES).
 */
const GATEWAY_MODULE_TO_DOMAIN_NAMES: Record<string, string[]> = {
  pimatrix:    ['routing', 'cameras', 'atem', 'composites'],
  pivoice:     ['voice'],
  piencoder:   ['encoder'],
  pitube:      ['youtube'],
  pisound:     ['sound'],
  pitally:     ['tally'],
  pirundown:   ['rundown', 'designer'],
  'pirundown-designer': ['designer'],
  pigraphics:  ['graphics'],
  piprogram:   ['program'],
  picam:       ['cameras'],
  pispace:     ['space'],
  piperception: ['perception'],
  piswitch:    ['routing'],
};

/**
 * Domain names that are always registered regardless of gateway module
 * toggles — they are utility, infrastructure or cross-cutting.
 */
const ALWAYS_ON_DOMAIN_NAMES = new Set([
  'system', 'world',
]);

/**
 * Filters NAMED_DOMAIN_MODULES to only those permitted by the gateway's
 * module toggle list. Always-on domains (system, world) are never filtered out.
 * Pass null (unrestricted) to get the full list.
 */
export function filterDomainsByGatewayModules(gatewayModules: string[] | null): DomainModule[] {
  if (!gatewayModules) return DOMAIN_MODULES;
  const enabled = new Set<string>();
  for (const gm of gatewayModules) {
    for (const dm of GATEWAY_MODULE_TO_DOMAIN_NAMES[gm] ?? []) {
      enabled.add(dm);
    }
  }
  return NAMED_DOMAIN_MODULES
    .filter(n => ALWAYS_ON_DOMAIN_NAMES.has(n.name) || enabled.has(n.name))
    .map(n => n.module);
}

export interface McpServerOptions {
  user: Principal;
  upstreams: Upstreams;
  audit: AuditLog;
  modules?: DomainModule[];
}

function toolResult(value: unknown): CallToolResult {
  const text = value === undefined ? 'Done.' : JSON.stringify(redact(value), null, 2);
  return { content: [{ type: 'text', text }] };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function readBody(body: ResourceBody, uri: URL): Promise<ReadResourceResult['contents'][number]> {
  if ('json' in body) return { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(redact(body.json), null, 2) };
  if ('text' in body) return { uri: uri.href, mimeType: body.mimeType, text: redact(body.text) as string };
  // Zero image/sound policy: binary payloads are strictly suppressed
  return { uri: uri.href, mimeType: 'text/plain', text: '[Binary media payload suppressed: zero image/sound to cloud]' };
}

/**
 * Builds the MCP server for one request. Only the tools and resources this caller may use are registered, and each
 * handler checks again, so a hidden tool is also refused when called by name.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const ctx: DomainContext = { user: options.user, upstreams: options.upstreams, audit: options.audit };
  const server = new McpServer(
    { name: 'picontrol-mcp', version: '0.2.0' },
    { instructions: 'Controls the Pi video and audio broadcast system. Read pi://help/domains once, read state from pi:// resources, then use the tools. For rundown cue sheets and action macros, consult pi://help/rundown and pi://schema/rundown-v2. PII is pseudonymized; zero raw images or sound are emitted.' },
  );

  for (const module of options.modules ?? DOMAIN_MODULES) {
    for (const tool of module.tools) {
      if (!canUse(ctx, tool)) continue;
      registerTool(server, tool, ctx);
    }
    for (const resource of module.resources) {
      if (!canUse(ctx, resource)) continue;
      const config = { title: resource.title, description: resource.description };
      const handler = async (uri: URL, vars: Record<string, string | string[]> = {}): Promise<ReadResourceResult> => {
        if (!canUse(ctx, resource)) throw new Error('Not allowed.');
        const flat = Object.fromEntries(Object.entries(vars).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value]));
        try {
          return { contents: [await readBody(await resource.read(ctx, flat), uri)] };
        } catch (error) {
          throw new Error(describeError(error));
        }
      };
      if (resource.uri.includes('{')) {
        server.registerResource(resource.name, new ResourceTemplate(resource.uri, { list: undefined }), config, (uri, vars) => handler(uri, vars));
      } else {
        server.registerResource(resource.name, resource.uri, { ...config, mimeType: 'application/json' }, uri => handler(uri));
      }
    }
  }
  return server;
}

function registerTool(server: McpServer, tool: ToolDefinition, ctx: DomainContext): void {
  server.registerTool(
    tool.name,
    { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: annotations(tool) },
    async (args: Record<string, unknown>) => {
      const started = Date.now();
      const who = ctx.user.name;
      if (!canUse(ctx, tool)) {
        ctx.audit.write({ event: 'tool.denied', user: who, tool: tool.name });
        return errorResult('You are not allowed to use this tool.');
      }
      try {
        // Inbound two-way pseudonymization: restores real names for downstream execution
        const resolvedArgs = defaultPseudonymizer.inbound(args) as Record<string, unknown>;
        const result = await tool.run(resolvedArgs, ctx);
        ctx.audit.write({ event: 'tool', user: who, tool: tool.name, args: redact(args), ok: true, ms: Date.now() - started, ...(ctx.user.tokenLabel ? { token: ctx.user.tokenLabel } : {}) });
        return toolResult(result);
      } catch (error) {
        const message = describeError(error);
        ctx.audit.write({ event: 'tool', user: who, tool: tool.name, args: redact(args), ok: false, error: message, ms: Date.now() - started });
        return errorResult(message);
      }
    },
  );
}
