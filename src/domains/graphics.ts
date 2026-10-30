import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { defaultPseudonymizer } from '../pseudonymize.js';
import { json } from './util.js';

const viewStream = { domain: 'graphics', level: 'view', scope: 'stream' } as const;
const operateStream = { domain: 'graphics', level: 'operate', scope: 'stream' } as const;

export const graphicsDomain: DomainModule = {
  resources: [
    {
      name: 'graphics-status',
      uri: 'pi://graphics/status',
      title: 'Broadcast Graphics Engine Status',
      description: 'Status of the broadcast graphics overlay engine (pigraphics): active lower-thirds, scripture straps, and fill/key stream channels. Scope: stream only.',
      permission: viewStream,
      upstream: 'pigraphics',
      read: async ctx => json(await requireClient(ctx, 'pigraphics').getStatus()),
    },
  ],
  tools: [
    defineTool({
      name: 'graphics_lower_third',
      title: 'Show or Hide Stream Lower Third',
      description: 'Triggers a broadcast lower-third strap on the live video stream (scope: stream). Does NOT project on the sanctuary wall. Real names are two-way restored locally.',
      permission: operateStream,
      upstream: 'pigraphics',
      effect: 'live',
      input: {
        action: z.enum(['show', 'hide']),
        title: z.string().optional().describe('Speaker name or role title (e.g. "Celebrant / Liturgi")'),
        subtitle: z.string().optional().describe('Subtitle or affiliation (e.g. "Kirkkoherra", "Riihimäen seurakunta")'),
        durationMs: z.number().int().min(1000).max(30000).default(6000).describe('Display duration before auto-hiding'),
      },
      run: async ({ action, title, subtitle, durationMs }, ctx) => {
        const client = requireClient(ctx, 'pigraphics');
        if (action === 'hide') return client.lowerThird('hide');
        const resolvedTitle = title ? defaultPseudonymizer.getRealName(title) : '';
        const resolvedSubtitle = subtitle ? defaultPseudonymizer.getRealName(subtitle) : undefined;
        return client.lowerThird('show', {
          title: resolvedTitle,
          ...(resolvedSubtitle !== undefined ? { subtitle: resolvedSubtitle } : {}),
          durationMs,
        });
      },
    }),
    defineTool({
      name: 'graphics_overlay',
      title: 'Show or Hide Stream Liturgical Overlay',
      description: 'Displays scripture reading, liturgical response, or hymn text overlay on the broadcast stream. Does not affect sanctuary wall projectors.',
      permission: operateStream,
      upstream: 'pigraphics',
      effect: 'live',
      input: {
        action: z.enum(['show', 'hide']),
        type: z.enum(['scripture', 'hymn', 'liturgy', 'banner']).default('scripture'),
        content: z.string().optional().describe('Text content to display'),
      },
      run: async ({ action, type, content }, ctx) => {
        const client = requireClient(ctx, 'pigraphics');
        if (action === 'hide') return client.overlay('hide');
        return client.overlay('show', { type, content: content ? defaultPseudonymizer.inbound(content) : '' });
      },
    }),
  ],
};
