import { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { AuditLog } from '../audit.js';
import type { Upstreams, UpstreamName } from '../upstream.js';
import { allows, type Permission } from '../users/permissions.js';
import type { Principal } from '../users/store.js';

export interface DomainContext {
  user: Principal;
  upstreams: Upstreams;
  audit: AuditLog;
}

export type Effect = 'read' | 'change' | 'live';

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  permission: Permission;
  upstream: UpstreamName | null;
  effect: Effect;
  idempotent: boolean;
  input: z.ZodRawShape;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (args: any, ctx: DomainContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(definition: {
  name: string;
  title: string;
  description: string;
  permission: Permission;
  upstream: UpstreamName | null;
  /** read: changes nothing; change: changes state but not the picture on air; live: can change what the audience sees or hears. */
  effect: Effect;
  idempotent?: boolean;
  input: S;
  run: (args: z.infer<z.ZodObject<S>>, ctx: DomainContext) => Promise<unknown>;
}): ToolDefinition {
  return { idempotent: false, ...definition } as ToolDefinition;
}

export function annotations(tool: ToolDefinition): ToolAnnotations {
  return {
    title: tool.title,
    readOnlyHint: tool.effect === 'read',
    destructiveHint: tool.effect === 'live',
    idempotentHint: tool.idempotent,
    openWorldHint: false,
  };
}

export type ResourceBody = { json: unknown } | { text: string; mimeType: string } | { blob: Buffer; mimeType: string };

export interface ResourceDefinition {
  name: string;
  title: string;
  description: string;
  /** A fixed URI, or a template such as pi://cameras/{id}. */
  uri: string;
  permission: Permission;
  upstream: UpstreamName | null;
  read: (ctx: DomainContext, vars: Record<string, string>) => Promise<ResourceBody>;
}

export interface DomainModule {
  tools: ToolDefinition[];
  resources: ResourceDefinition[];
}

/** Both checks use the same rule, so a hidden tool is also refused when called directly. */
export function canUse(ctx: DomainContext, item: { permission: Permission; upstream: UpstreamName | null }): boolean {
  if (item.upstream && !ctx.upstreams[item.upstream]) return false;
  return allows(ctx.user.rights, item.permission, ctx.user.scopes);
}

export function requireClient<K extends UpstreamName>(ctx: DomainContext, name: K): NonNullable<Upstreams[K]> {
  const client = ctx.upstreams[name];
  if (!client) throw new Error(`The ${name} service is not configured on this server.`);
  return client as NonNullable<Upstreams[K]>;
}
