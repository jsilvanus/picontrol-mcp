import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { defaultPseudonymizer } from '../pseudonymize.js';
import { json } from './util.js';
import {
  RUNDOWN_V2_JSON_SCHEMA,
  ACTIONS_JSON_SCHEMA,
  RUNDOWN_GUIDE,
  ACTIONS_GUIDE,
} from './rundown-schema.js';

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
    {
      name: 'rundown-global-cues',
      uri: 'pi://rundown/cues/global',
      title: 'Global Broadcast Cues',
      description: 'Standing global broadcast cues (e.g. "when communion starts, do privacy blur on camera 1").',
      permission: viewEvent,
      upstream: 'pirundown',
      read: async ctx => {
        const raw = await requireClient(ctx, 'pirundown').listGlobalCues();
        return json(defaultPseudonymizer.outbound(raw));
      },
    },
    {
      name: 'rundown-schema-v2',
      uri: 'pi://schema/rundown-v2',
      title: 'Rundown v2 Document JSON Schema',
      description: 'Complete JSON Schema for Rundown v2 documents (cues, actions, connectors, preflight, AI rules).',
      permission: viewEvent,
      upstream: null,
      read: async () => json(RUNDOWN_V2_JSON_SCHEMA),
    },
    {
      name: 'rundown-schema-actions',
      uri: 'pi://schema/actions',
      title: 'Rundown Actions JSON Schema',
      description: 'JSON Schema for all Rundown v2 action types and string shorthand syntax.',
      permission: viewEvent,
      upstream: null,
      read: async () => json(ACTIONS_JSON_SCHEMA),
    },
    {
      name: 'rundown-help-guide',
      uri: 'pi://help/rundown',
      title: 'Rundown v2 Creation and Authoring Guide',
      description: 'Comprehensive guide to authoring liturgical Rundown v2 documents and configuring cue sheet triggers.',
      permission: viewEvent,
      upstream: null,
      read: async () => ({ text: RUNDOWN_GUIDE, mimeType: 'text/markdown' }),
    },
    {
      name: 'rundown-help-actions',
      uri: 'pi://help/actions',
      title: 'Rundown Actions and Macro Reference',
      description: 'Comprehensive guide to all action item types (cam, atem, tally, pipgm, alternate, var, delay) and shorthand syntax.',
      permission: viewEvent,
      upstream: null,
      read: async () => ({ text: ACTIONS_GUIDE, mimeType: 'text/markdown' }),
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
      name: 'rundown_action_exec',
      title: 'Execute or Test Rundown Action',
      description: 'Dispatches a single rundown action (object or shorthand string, e.g. "cam:1:preset:altar", "atem:cut:2") to the broadcast system, or dry-runs syntax and variable resolution without firing hardware.',
      permission: operateEvent,
      upstream: 'pirundown',
      effect: 'live',
      input: {
        action: z.union([
          z.record(z.string(), z.unknown()),
          z.string(),
        ]).describe('The action object (e.g. { cam: { id: 1, preset: "altar" } }) or shorthand string (e.g. "cam:1:preset:altar")'),
        dryRun: z.boolean().optional().describe('If true, validates syntax without firing hardware'),
      },
      run: async ({ action, dryRun }, ctx) => {
        const resolved = defaultPseudonymizer.inbound(action);
        return requireClient(ctx, 'pirundown').dispatchAction(resolved, dryRun);
      },
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
    defineTool({
      name: 'rundown_global_cue_create',
      title: 'Create Global Broadcast Cue',
      description: 'Creates a standing global hardware cue in pirundown (e.g. "when communion starts, do privacy blur on camera 1").',
      permission: operateEvent,
      upstream: 'pirundown',
      effect: 'live',
      input: {
        prompt: z.string().min(1).describe('Natural language or structured description of the global cue, e.g. "when communion starts, do privacy blur on camera 1"'),
      },
      run: async ({ prompt }, ctx) => {
        const resolved = defaultPseudonymizer.inbound(prompt);
        return requireClient(ctx, 'pirundown').createGlobalCue({ prompt: resolved });
      },
    }),
    defineTool({
      name: 'rundown_global_cue_delete',
      title: 'Delete Global Broadcast Cue',
      description: 'Removes a global broadcast cue by ID.',
      permission: operateEvent,
      upstream: 'pirundown',
      effect: 'change',
      input: {
        id: z.string().min(1).describe('ID of the global cue to remove'),
      },
      run: async ({ id }, ctx) => requireClient(ctx, 'pirundown').deleteGlobalCue(id),
    }),
  ],
};
