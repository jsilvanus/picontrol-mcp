import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { defaultPseudonymizer } from '../pseudonymize.js';
import { json } from './util.js';

const viewEvent = { domain: 'designer', level: 'view', scope: 'event' } as const;
const operateEvent = { domain: 'designer', level: 'operate', scope: 'event' } as const;
const configEvent = { domain: 'designer', level: 'config', scope: 'event' } as const;

export const designerDomain: DomainModule = {
  resources: [
    {
      name: 'designer-state',
      uri: 'pi://designer/state',
      title: 'Active Rundown Designer Session State',
      description: 'The current active rundown designer state including service metadata, hymns, personnel, cue items, and synchronized YAML.',
      permission: viewEvent,
      upstream: 'pirundownDesigner',
      read: async (ctx) => {
        const raw = await requireClient(ctx, 'pirundownDesigner').getState();
        return json(defaultPseudonymizer.outbound(raw));
      },
    },
  ],
  tools: [
    defineTool({
      name: 'designer_get_state',
      title: 'Get Active Designer State',
      description: 'Retrieves the complete state of the active rundown designer: metadata, hymns, speakers, items, warnings, and synchronized YAML.',
      permission: operateEvent,
      upstream: 'pirundownDesigner',
      effect: 'change',
      input: {},
      run: async (_args, ctx) => {
        const raw = await requireClient(ctx, 'pirundownDesigner').getState();
        return defaultPseudonymizer.outbound(raw);
      },
    }),
    defineTool({
      name: 'designer_apply_yaml',
      title: 'Apply Full Rundown YAML in Designer',
      description: 'Replaces or loads a complete Rundown v2 YAML document into the designer session, with full validation.',
      permission: operateEvent,
      upstream: 'pirundownDesigner',
      effect: 'change',
      input: {
        yaml: z.string().min(1).describe('Complete YAML string adhering to Rundown v2 schema'),
      },
      run: async ({ yaml }, ctx) => {
        const resolved = defaultPseudonymizer.inbound(yaml);
        return requireClient(ctx, 'pirundownDesigner').applyYaml(resolved);
      },
    }),
    defineTool({
      name: 'designer_add_item',
      title: 'Add Cue Item to Rundown Design',
      description: 'Adds a new cue item into the active service design. Can specify section, targetZone, graphicsOptions, and cue triggers.',
      permission: operateEvent,
      upstream: 'pirundownDesigner',
      effect: 'change',
      input: {
        item: z.object({
          id: z.string().optional().describe('Unique cue item ID (e.g. "saarna", "virsi_332")'),
          title: z.string().describe('Title of the cue item (e.g. "Alkuvirsi", "Saarna")'),
          section: z.string().optional().describe('Liturgical section: Johdanto, Sana, Rukous, Ehtoollinen, Päätös'),
          notes: z.string().optional().describe('Notes for celebrant or operator'),
          cue: z.record(z.string(), z.unknown()).optional().describe('Cue trigger definition, e.g. { type: "sound", event: "music_stop" }'),
          actions: z.array(z.record(z.string(), z.unknown())).optional().describe('List of rundown action objects'),
          ai: z.object({
            targetZone: z.string().optional().describe('Camera target zone: pulpit, ambo, altar, choir, congregation'),
            graphicsOptions: z.object({
              lowerThird: z.array(z.string()).optional().describe('Allowed lower-third templates, e.g. ["lower-third-speaker"]'),
              overlay: z.array(z.string()).optional().describe('Allowed overlay templates, e.g. ["scripture-reading"]'),
              templates: z.array(z.string()).optional(),
            }).optional(),
          }).optional(),
        }).describe('The cue item to add'),
        section: z.string().optional().describe('Fallback liturgical section if not in item'),
        index: z.number().int().optional().describe('Zero-based index where to insert the item'),
      },
      run: async (body, ctx) => {
        const resolved = defaultPseudonymizer.inbound(body);
        return requireClient(ctx, 'pirundownDesigner').addItem(resolved.item, resolved.section, resolved.index);
      },
    }),
    defineTool({
      name: 'designer_update_item',
      title: 'Update Cue Item in Rundown Design',
      description: 'Updates an existing cue item in the active rundown design by ID (title, section, cue, actions, ai properties).',
      permission: operateEvent,
      upstream: 'pirundownDesigner',
      effect: 'change',
      input: {
        id: z.string().min(1).describe('ID of the cue item to update'),
        patch: z.record(z.string(), z.unknown()).describe('Fields to update on the item'),
      },
      run: async ({ id, patch }, ctx) => {
        const resolved = defaultPseudonymizer.inbound(patch);
        return requireClient(ctx, 'pirundownDesigner').updateItem(id, resolved);
      },
    }),
    defineTool({
      name: 'designer_delete_item',
      title: 'Delete Cue Item from Rundown Design',
      description: 'Removes a cue item from the active rundown design by ID.',
      permission: operateEvent,
      upstream: 'pirundownDesigner',
      effect: 'change',
      input: {
        id: z.string().min(1).describe('ID of the cue item to remove'),
      },
      run: async ({ id }, ctx) => {
        return requireClient(ctx, 'pirundownDesigner').deleteItem(id);
      },
    }),
    defineTool({
      name: 'designer_set_metadata',
      title: 'Set Service Metadata & Hymns in Designer',
      description: 'Updates service metadata (title, church, date), hymns selection, or personnel for the active design.',
      permission: operateEvent,
      upstream: 'pirundownDesigner',
      effect: 'change',
      input: {
        metadata: z.object({
          title: z.string().optional(),
          service: z.string().optional(),
          church: z.string().optional(),
          date: z.string().optional(),
        }).optional(),
        hymns: z.record(z.string(), z.string()).optional().describe('Hymn selections, e.g. { hymn_1: "332", hymn_2: "450" }'),
        speakers: z.array(z.object({
          id: z.string(),
          role: z.string(),
          name: z.string().optional(),
          title: z.string().optional(),
          hasName: z.boolean().optional(),
          isRoleOnly: z.boolean().optional(),
        })).optional(),
      },
      run: async ({ metadata, hymns, speakers }, ctx) => {
        const resolvedMetadata = metadata ? defaultPseudonymizer.inbound(metadata) : undefined;
        const resolvedSpeakers = speakers ? defaultPseudonymizer.inbound(speakers) : undefined;
        return requireClient(ctx, 'pirundownDesigner').setMetadata(resolvedMetadata, hymns, resolvedSpeakers);
      },
    }),
    defineTool({
      name: 'designer_load_template',
      title: 'Load Liturgical Template into Designer',
      description: 'Loads a liturgical service template into the designer (e.g. "messu", "sanajumalanpalvelus").',
      permission: operateEvent,
      upstream: 'pirundownDesigner',
      effect: 'change',
      input: {
        templateId: z.string().min(1).describe('Template ID ("messu", "sanajumalanpalvelus")'),
      },
      run: async ({ templateId }, ctx) => {
        return requireClient(ctx, 'pirundownDesigner').loadTemplate(templateId);
      },
    }),
    defineTool({
      name: 'designer_chat',
      title: 'Chat with Rundown Designer Agent',
      description: 'Sends a natural language instruction to the rundown designer agent to inspect or adjust the active service design.',
      permission: operateEvent,
      upstream: 'pirundownDesigner',
      effect: 'change',
      input: {
        message: z.string().min(1).describe('The natural language prompt (e.g. "Lisää saarnaan pulpit ja grafiikat")'),
      },
      run: async ({ message }, ctx) => {
        const resolved = defaultPseudonymizer.inbound(message);
        return requireClient(ctx, 'pirundownDesigner').chat(resolved);
      },
    }),
  ],
};
