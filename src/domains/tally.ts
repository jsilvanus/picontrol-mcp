import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const read = { domain: 'tally', level: 'read' } as const;
const write = { domain: 'tally', level: 'write' } as const;
const admin = { domain: 'tally', level: 'admin' } as const;

export const tallyDomain: DomainModule = {
  resources: [
    {
      name: 'tally-lights',
      uri: 'pi://tally/lights',
      title: 'Tally lights status',
      description: 'List of all registered Tally-Ma wireless tally lights, current modes (PGM/PRV/OFF), hold status, and brightness.',
      permission: read,
      upstream: 'pilight',
      read: async ctx => json(await requireClient(ctx, 'pilight').listLights()),
    },
    {
      name: 'tally-light-detail',
      uri: 'pi://tally/lights/{id}',
      title: 'Tally light detail & segments',
      description: 'Details of a specific tally unit including 9-LED free segments and mDNS/IP configuration.',
      permission: read,
      upstream: 'pilight',
      read: async (ctx, { id }) => json(await requireClient(ctx, 'pilight').getLight(id!)),
    },
  ],
  tools: [
    defineTool({
      name: 'tally_list',
      title: 'List all tally lights',
      description: 'List all registered Tally-Ma units with their current mode, brightness, host, and segments.',
      permission: write,
      upstream: 'pilight',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pilight').listLights(),
    }),
    defineTool({
      name: 'tally_set_state',
      title: 'Set tally light state or color',
      description: 'Set a tally light mode to "pgm" (Program - Red), "prv" (Preview - Green), "off" (Dark), or custom hex color (e.g. "#FF8800").',
      permission: write,
      upstream: 'pilight',
      effect: 'live',
      idempotent: true,
      input: {
        id: z.string().describe('Tally unit ID or name (e.g. "tally01", "1", "cam1")'),
        mode: z.string().describe('"pgm", "prv", "off", or hex color code'),
      },
      run: async ({ id, mode }, ctx) => requireClient(ctx, 'pilight').setState(id, mode),
    }),
    defineTool({
      name: 'tally_cue',
      title: 'Trigger PTZ camera director cue animation',
      description: 'Send a directional cue animation to the camera tally light (UDP port 21324) to guide the camera operator.',
      permission: write,
      upstream: 'pilight',
      effect: 'live',
      idempotent: false,
      input: {
        id: z.string().describe('Tally unit ID or name'),
        direction: z.enum(['pan-left', 'pan-right', 'zoom-in', 'zoom-out', 'operator-call']),
        durationMs: z.number().int().min(500).max(10000).optional().default(2000),
      },
      run: async ({ id, direction, durationMs }, ctx) => requireClient(ctx, 'pilight').cue(id, direction, durationMs),
    }),
    defineTool({
      name: 'tally_call',
      title: 'Flash talent / operator call',
      description: 'Flashes the light white 3 times to get operator or talent attention.',
      permission: write,
      upstream: 'pilight',
      effect: 'live',
      idempotent: false,
      input: {
        id: z.string().describe('Tally unit ID'),
      },
      run: async ({ id }, ctx) => requireClient(ctx, 'pilight').call(id),
    }),
    defineTool({
      name: 'tally_hold',
      title: 'Toggle HOLDDATA on tally light',
      description: 'When hold is true, the light suppresses external server updates, preserving its current state.',
      permission: write,
      upstream: 'pilight',
      effect: 'change',
      idempotent: true,
      input: {
        id: z.string().describe('Tally unit ID'),
        hold: z.boolean().describe('True to lock/hold state, false to release'),
      },
      run: async ({ id, hold }, ctx) => requireClient(ctx, 'pilight').hold(id, hold),
    }),
    defineTool({
      name: 'tally_brightness',
      title: 'Set tally light brightness',
      description: 'Adjust the LED brightness of a tally light unit.',
      permission: write,
      upstream: 'pilight',
      effect: 'change',
      idempotent: true,
      input: {
        id: z.string().describe('Tally unit ID'),
        brightness: z.enum(['low', 'medium', 'high']),
      },
      run: async ({ id, brightness }, ctx) => requireClient(ctx, 'pilight').brightness(id, brightness),
    }),
    defineTool({
      name: 'tally_set_segments',
      title: 'Configure 9-LED free segments (multi-status)',
      description: 'Split the 9 LEDs into groups displaying independent status facets (e.g. YouTube stream, ATEM recording, projector).',
      permission: admin,
      upstream: 'pilight',
      effect: 'change',
      idempotent: true,
      input: {
        id: z.string().describe('Tally unit ID'),
        segments: z.array(z.record(z.string(), z.unknown())).describe('List of segment facet definitions'),
      },
      run: async ({ id, segments }, ctx) => requireClient(ctx, 'pilight').setSegments(id, segments),
    }),
    defineTool({
      name: 'tally_cycle',
      title: 'Run 9-LED cycle diagnostic test',
      description: 'Sequentially lights up LEDs 1 through 9 in Red, Green, and Amber to verify physical LED ordering from the booth.',
      permission: admin,
      upstream: 'pilight',
      effect: 'change',
      idempotent: false,
      input: {
        id: z.string().describe('Tally unit ID'),
      },
      run: async ({ id }, ctx) => requireClient(ctx, 'pilight').cycle(id),
    }),
  ],
};
