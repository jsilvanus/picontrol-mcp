import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const read = { domain: 'radio', level: 'read' } as const;
const write = { domain: 'radio', level: 'write' } as const;

export const radioDomain: DomainModule = {
  resources: [
    {
      name: 'radio-status',
      uri: 'pi://radio/status',
      title: 'Web radio relay stream status',
      description: 'Web radio relay lifecycle status: whether the stream is running, reachable, listeners count, and stream name.',
      permission: read,
      upstream: 'radio',
      read: async ctx => json(await requireClient(ctx, 'radio').getStatus()),
    },
  ],
  tools: [
    defineTool({
      name: 'radio_status',
      title: 'Check web radio stream status',
      description: 'Query status, running state, and listeners of the web radio relay stream.',
      permission: write,
      upstream: 'radio',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'radio').getStatus(),
    }),
    defineTool({
      name: 'radio_start',
      title: 'Start web radio relay stream',
      description: 'Start streaming audio from the Pi to the Icecast/Shoutcast web radio server for parishioners to listen online.',
      permission: write,
      upstream: 'radio',
      effect: 'live',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'radio').start(),
    }),
    defineTool({
      name: 'radio_stop',
      title: 'Stop web radio relay stream',
      description: 'Stop the web radio relay transmission.',
      permission: write,
      upstream: 'radio',
      effect: 'live',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'radio').stop(),
    }),
  ],
};
