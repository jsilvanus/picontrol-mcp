import { z } from 'zod';
import type { CompositePatch } from '../generated/pimatrix/index.js';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { cast, json } from './util.js';

const read = { domain: 'composites', level: 'read' } as const;
const write = { domain: 'composites', level: 'write' } as const;

const compositeId = z.enum(['compose1', 'compose2']).describe('compose1 = HDMI key page, compose2 = ATEM media still.');
const MAX_PNG_BYTES = 10 * 1024 * 1024;

export const composites: DomainModule = {
  resources: [
    {
      name: 'composites', uri: 'pi://composites', title: 'Slide composites',
      description: 'The slide composites (compose1 HDMI key, compose2 ATEM media) with settings and state: stopped, waiting, busy, running, failed.',
      permission: read, upstream: 'pimatrix',
      read: async ctx => json(await requireClient(ctx, 'pimatrix').composites.listComposites()),
    },
    {
      name: 'composite', uri: 'pi://composites/{id}', title: 'One composite',
      description: 'One composite (compose1 or compose2) with its settings, state and last error.',
      permission: read, upstream: 'pimatrix',
      read: async (ctx, vars) => json(await requireClient(ctx, 'pimatrix').composites.getComposite(cast(vars.id))),
    },
    {
      name: 'composite-preview', uri: 'pi://composites/{id}/preview', title: 'Composite preview image',
      description: 'PNG preview of what a composite currently renders.',
      permission: read, upstream: 'pimatrix',
      read: async (ctx, vars) => {
        const blob = await requireClient(ctx, 'pimatrix').composites.getCompositePreview(cast(vars.id));
        return { blob: Buffer.from(await blob.arrayBuffer()), mimeType: 'image/png' };
      },
    },
  ],
  tools: [
    defineTool({
      name: 'composite_set_slide', title: 'Set the composite slide',
      description: 'Send a slide image (PNG, up to 10 MB, base64) to the composites. Both composites re-render; read pi://composites until the state is running. ' +
        'This changes what the ATEM keys over the picture once the composite is started.',
      permission: write, upstream: 'pimatrix', effect: 'live', idempotent: true,
      input: { pngBase64: z.string().min(1).describe('The PNG file, base64 encoded.') },
      run: async ({ pngBase64 }, ctx) => {
        const bytes = Buffer.from(pngBase64, 'base64');
        if (bytes.length === 0 || bytes.length > MAX_PNG_BYTES) throw new Error('The PNG must be between 1 byte and 10 MB.');
        if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('The data is not a PNG file.');
        return requireClient(ctx, 'pimatrix').composites.setCompositeSlide(new Blob([bytes], { type: 'image/png' }));
      },
    }),
    defineTool({
      name: 'composite_control', title: 'Start, stop or configure a composite',
      description: 'Start or stop a composite, or change its settings (size, side, slide aspect and scale, key colour and mode, ATEM media slot, player, DSK, autoOnAir). ' +
        'action "start"/"stop" ignore "settings"; action "update" needs "settings". Starting puts the slide where the switcher can key it.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: {
        composite: compositeId,
        action: z.enum(['start', 'stop', 'update']),
        settings: z.object({
          enabled: z.boolean().optional(), width: z.number().int().optional(), height: z.number().int().optional(),
          side: z.enum(['left', 'right']).optional(), slideAspect: z.enum(['10:16', '9:16']).optional(), slideScale: z.number().optional(),
          keyColor: z.string().optional(), keyMode: z.enum(['chroma', 'luma']).optional(),
          atem: z.object({ mediaSlot: z.number().int().optional(), mediaPlayer: z.number().int().optional(), dskIndex: z.number().int().optional(), autoOnAir: z.boolean().optional() }).optional(),
        }).optional(),
      },
      run: async ({ composite, action, settings }, ctx) => {
        const client = requireClient(ctx, 'pimatrix').composites;
        if (action === 'start') return client.startComposite(cast(composite));
        if (action === 'stop') return client.stopComposite(cast(composite));
        if (!settings) throw new Error('"settings" is required for action "update".');
        return client.updateComposite(cast(composite), cast<CompositePatch>(settings));
      },
    }),
  ],
};
