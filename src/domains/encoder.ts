import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const read = { domain: 'encoder', level: 'read' } as const;
const write = { domain: 'encoder', level: 'write' } as const;

export const encoderDomain: DomainModule = {
  resources: [
    {
      name: 'encoder-status',
      uri: 'pi://encoder/status',
      title: 'Matrox Monarch HDX hardware encoder status',
      description: 'Current status of Matrox Monarch HDX: connectivity, encoder 1 (RTMP stream), and encoder 2 (MP4 record).',
      permission: read,
      upstream: 'encoder',
      read: async ctx => json(await requireClient(ctx, 'encoder').getStatus()),
    },
    {
      name: 'encoder-settings',
      uri: 'pi://encoder/settings',
      title: 'Matrox Monarch HDX settings',
      description: 'Encoder settings including video input (SDI/HDMI), audio input (ANALOG/DIGITAL), bitrate, and recording file name.',
      permission: read,
      upstream: 'encoder',
      read: async ctx => json(await requireClient(ctx, 'encoder').getSettings()),
    },
  ],
  tools: [
    defineTool({
      name: 'encoder_status',
      title: 'Get Matrox encoder status',
      description: 'Query connection, streaming state (Encoder 1), and recording state (Encoder 2) of the Matrox Monarch HDX.',
      permission: write,
      upstream: 'encoder',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'encoder').getStatus(),
    }),
    defineTool({
      name: 'encoder_control',
      title: 'Start or stop Matrox encoder',
      description: 'Start or stop hardware video encoding. Encoder 1 is configured for RTMP streaming to YouTube/CDN, and Encoder 2 is for MP4 USB/SD recording.',
      permission: write,
      upstream: 'encoder',
      effect: 'live',
      idempotent: false,
      input: {
        action: z.enum(['start', 'stop']).describe('Whether to start or stop the encoder.'),
        encoder: z.enum(['1', '2', 'both']).default('both').describe('Target encoder: 1 (stream), 2 (record), or both.'),
      },
      run: async ({ action, encoder }, ctx) => {
        const target = encoder === '1' ? 1 : encoder === '2' ? 2 : 'both';
        const client = requireClient(ctx, 'encoder');
        return action === 'start' ? client.start(target) : client.stop(target);
      },
    }),
    defineTool({
      name: 'encoder_input_status',
      title: 'Get encoder video input status',
      description: 'Query lock status, resolution, and frame rate detected on the encoder SDI/HDMI inputs.',
      permission: write,
      upstream: 'encoder',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'encoder').getInputStatus(),
    }),
  ],
};
