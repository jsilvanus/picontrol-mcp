import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const read = { domain: 'youtube', level: 'read' } as const;
const write = { domain: 'youtube', level: 'write' } as const;

export const youtubeDomain: DomainModule = {
  resources: [
    {
      name: 'youtube-status',
      uri: 'pi://youtube/status',
      title: 'YouTube live broadcast status',
      description: 'Current active YouTube live broadcast, stream health, caption sender stats, and pigateway link.',
      permission: read,
      upstream: 'pitube',
      read: async ctx => json(await requireClient(ctx, 'pitube').getStatus()),
    },
    {
      name: 'youtube-broadcasts',
      uri: 'pi://youtube/broadcasts',
      title: 'Upcoming YouTube broadcasts',
      description: 'List of scheduled broadcasts on the channel and currently selected broadcast ID.',
      permission: read,
      upstream: 'pitube',
      read: async ctx => json(await requireClient(ctx, 'pitube').listBroadcasts()),
    },
  ],
  tools: [
    defineTool({
      name: 'youtube_broadcast_list',
      title: 'List upcoming YouTube broadcasts',
      description: 'Query scheduled upcoming live broadcasts on the YouTube channel.',
      permission: write,
      upstream: 'pitube',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pitube').listBroadcasts(),
    }),
    defineTool({
      name: 'youtube_broadcast_select',
      title: 'Select active YouTube broadcast',
      description: 'Set which upcoming broadcast to stream to and send captions for. Use "auto" to automatically pick the closest upcoming scheduled broadcast.',
      permission: write,
      upstream: 'pitube',
      effect: 'change',
      idempotent: true,
      input: {
        broadcastId: z.string().describe('YouTube broadcast ID or "auto"'),
      },
      run: async ({ broadcastId }, ctx) => requireClient(ctx, 'pitube').selectBroadcast(broadcastId),
    }),
    defineTool({
      name: 'youtube_broadcast_create',
      title: 'Create an ad-hoc live broadcast',
      description: 'Create a new live broadcast on YouTube when no event was pre-scheduled in YouTube Studio, binds a reusable live stream, and selects it.',
      permission: write,
      upstream: 'pitube',
      effect: 'change',
      idempotent: false,
      input: {
        title: z.string().describe('Title of the YouTube broadcast'),
        privacy: z.enum(['public', 'unlisted', 'private']).default('public'),
        description: z.string().optional().describe('Broadcast description'),
        scheduledStartTime: z.string().optional().describe('ISO 8601 start time'),
      },
      run: async (input, ctx) => requireClient(ctx, 'pitube').createBroadcast(input),
    }),
    defineTool({
      name: 'youtube_broadcast_start',
      title: 'Go Live on YouTube',
      description: 'Transition the selected broadcast to LIVE. Connects the live caption sender engine (30s video delay offset) and reports live status. The video encoder must already be pushing RTMP.',
      permission: write,
      upstream: 'pitube',
      effect: 'live',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pitube').startBroadcast(),
    }),
    defineTool({
      name: 'youtube_broadcast_stop',
      title: 'End YouTube live broadcast',
      description: 'Permanently end the active YouTube broadcast. Halts captions and resets to idle. WARNING: Transitioning a broadcast to complete is irreversible.',
      permission: write,
      upstream: 'pitube',
      effect: 'live',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pitube').stopBroadcast(),
    }),
    defineTool({
      name: 'youtube_status',
      title: 'Check YouTube streaming & captions status',
      description: 'Get active broadcast details, ingest health (good/ok/noData/poor), and caption delivery counters.',
      permission: write,
      upstream: 'pitube',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pitube').getStatus(),
    }),
  ],
};
