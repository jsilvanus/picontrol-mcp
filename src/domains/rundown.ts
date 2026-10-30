import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { defaultPseudonymizer } from '../pseudonymize.js';
import { json } from './util.js';

const viewEvent = { domain: 'rundown', level: 'view', scope: 'event' } as const;
const operateEvent = { domain: 'rundown', level: 'operate', scope: 'event' } as const;
const configEvent = { domain: 'rundown', level: 'config', scope: 'event' } as const;

export const rundownDomain: DomainModule = {
  resources: [
    {
      name: 'rundown-current',
      uri: 'pi://rundown/current',
      title: 'Liturgical Rundown & Cues',
      description: 'The current service cue sheet with active and upcoming cues. All speakers and participants are strictly title/role pseudonymized (e.g. Celebrant / Liturgi, Preacher / Saarnaaja, Lector / Lukija).',
      permission: viewEvent,
      upstream: 'pirundown',
      read: async ctx => {
        const raw = await requireClient(ctx, 'pirundown').getCurrent();
        return json(defaultPseudonymizer.outbound(raw));
      },
    },
  ],
  tools: [
    defineTool({
      name: 'rundown_cue_next',
      title: 'Advance to Next Cue',
      description: 'Steps the live liturgy forward to the next scheduled cue (e.g. hymn -> sermon -> scripture reading). Operates live show.',
      permission: operateEvent,
      upstream: 'pirundown',
      effect: 'live',
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pirundown').nextCue(),
    }),
    defineTool({
      name: 'rundown_cue_prev',
      title: 'Step Back to Previous Cue',
      description: 'Steps the live liturgy back to the previous cue in case of miscue or delay.',
      permission: operateEvent,
      upstream: 'pirundown',
      effect: 'live',
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pirundown').prevCue(),
    }),
    defineTool({
      name: 'rundown_goto',
      title: 'Jump to Specific Cue',
      description: 'Directly jumps the live service cue position to a specific cue ID.',
      permission: operateEvent,
      upstream: 'pirundown',
      effect: 'live',
      input: {
        cueId: z.string().describe('ID of the cue to jump to'),
      },
      run: async ({ cueId }, ctx) => requireClient(ctx, 'pirundown').gotoCue(cueId),
    }),
    defineTool({
      name: 'rundown_create_or_update',
      title: 'Configure or Upload Rundown Cue Sheet',
      description: 'Event setup: creates or updates the service cue sheet. Staging role only, cannot be called while running live without config rights.',
      permission: configEvent,
      upstream: 'pirundown',
      effect: 'change',
      idempotent: true,
      input: {
        title: z.string().describe('Service title or date, e.g. "Messu 1. adventtisunnuntaina"'),
        cues: z.array(z.object({
          id: z.string(),
          title: z.string(),
          role: z.string().optional().describe('Role/Title: e.g. Liturgist, Preacher, Lector, Musician'),
          speaker: z.string().optional().describe('Pseudonymized or role-based speaker name'),
          durationMinutes: z.number().optional(),
          hymnNumber: z.string().optional(),
          slideItem: z.string().optional(),
        })),
      },
      run: async (body, ctx) => {
        const resolved = defaultPseudonymizer.inbound(body);
        return requireClient(ctx, 'pirundown').createOrUpdate(resolved);
      },
    }),
  ],
};
