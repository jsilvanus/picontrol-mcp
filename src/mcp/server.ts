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
import { redact } from '../redact.js';
import { describeError, type Upstreams } from '../upstream.js';
import type { Principal } from '../users/store.js';
import { annotations, canUse, type DomainContext, type DomainModule, type ResourceBody, type ToolDefinition } from './registry.js';

export const DOMAIN_MODULES: DomainModule[] = [system, routing, cameras, atem, program, composites, voiceDomain];

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
  if ('text' in body) return { uri: uri.href, mimeType: body.mimeType, text: body.text };
  return { uri: uri.href, mimeType: body.mimeType, blob: body.blob.toString('base64') };
}

/**
 * Builds the MCP server for one request. Only the tools and resources this caller may use are registered, and each
 * handler checks again, so a hidden tool is also refused when called by name.
 */
export function createMcpServer(options: McpServerOptions): McpServer {
  const ctx: DomainContext = { user: options.user, upstreams: options.upstreams, audit: options.audit };
  const server = new McpServer(
    { name: 'picontrol-mcp', version: '0.1.0' },
    { instructions: 'Controls the Pi video and audio system of the church. Read pi://help/domains once, read state from pi:// resources, then use the tools. Tools marked destructive change what is on air.' },
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
        const result = await tool.run(args, ctx);
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
