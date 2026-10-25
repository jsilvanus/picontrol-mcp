import { z } from 'zod';
import type {
  CropPresetRequest, MoveCropRequest, ResizeCropRequest, SetOutputSourceRequest, SetRotationRequest,
  UpdateCropRequest, MultiviewSlotRequest,
} from '../generated/pimatrix/index.js';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { cast, json, need, outputId, sourceId } from './util.js';

const read = { domain: 'routing', level: 'read' } as const;
const write = { domain: 'routing', level: 'write' } as const;
const admin = { domain: 'routing', level: 'admin' } as const;

export const routing: DomainModule = {
  resources: [
    {
      name: 'routing-matrix', uri: 'pi://routing/matrix', title: 'Video matrix',
      description: 'Atlona matrix routes (which input feeds which output) and whether the matrix is locked.',
      permission: read, upstream: 'pimatrix',
      read: async ctx => json(await requireClient(ctx, 'pimatrix').outputs.getMatrix()),
    },
    {
      name: 'routing-outputs', uri: 'pi://routing/outputs', title: 'Outputs',
      description: 'Pi HDMI outputs (hdmi0, hdmi1, multiview) with the source each one shows, plus the RTSP output.',
      permission: read, upstream: 'pimatrix',
      read: async ctx => {
        const client = requireClient(ctx, 'pimatrix');
        const [outputs, rtsp] = await Promise.all([client.outputs.listOutputs(), client.outputs.getRtspOutput()]);
        return json({ ...outputs, rtsp });
      },
    },
    {
      name: 'routing-output', uri: 'pi://routing/outputs/{id}', title: 'One output with its effects',
      description: 'One output (hdmi0, hdmi1 or multiview) with the source it shows and the crop applied on it.',
      permission: read, upstream: 'pimatrix',
      read: async (ctx, vars) => {
        const client = requireClient(ctx, 'pimatrix');
        const id = vars.id as 'hdmi0';
        const [outputs, effects] = await Promise.all([client.outputs.listOutputs(), client.effects.getOutputEffects(cast(id))]);
        return json({ output: outputs.items.find(item => String(item.id) === id) ?? null, effects });
      },
    },
    {
      name: 'routing-multiview', uri: 'pi://routing/multiview', title: 'Multiview',
      description: 'The 8-way multiview: layout mode, tiles and slot replacements.',
      permission: read, upstream: 'pimatrix',
      read: async ctx => json(await requireClient(ctx, 'pimatrix').outputs.getMultiview()),
    },
    {
      name: 'routing-sources', uri: 'pi://routing/sources', title: 'Sources',
      description: 'All video sources: capture card, RTMP inputs, cameras and the program pipelines, with their state.',
      permission: read, upstream: 'pimatrix',
      read: async ctx => json(await requireClient(ctx, 'pimatrix').sources.listSources(true)),
    },
    {
      name: 'routing-source', uri: 'pi://routing/sources/{id}', title: 'One source with its effects',
      description: 'One source with its crop, rotation, fade-to-black and mute state.',
      permission: read, upstream: 'pimatrix',
      read: async (ctx, vars) => {
        const client = requireClient(ctx, 'pimatrix');
        const id = cast<'hama'>(vars.id);
        const [source, effects] = await Promise.all([client.sources.getSource(cast(id)), client.effects.getSourceEffects(cast(id))]);
        return json({ source, effects });
      },
    },
  ],
  tools: [
    defineTool({
      name: 'routing_set_output_source', title: 'Show a source on an output',
      description: 'Choose which source a Pi output (hdmi0, hdmi1 or multiview) shows. This changes the picture on that output at once. ' +
        'Read pi://routing/outputs first for the current state and pi://routing/sources for valid source ids. Pass source null to clear the output.',
      permission: write, upstream: 'pimatrix', effect: 'live', idempotent: true,
      input: { output: outputId, source: sourceId.nullable().describe('Source id, or null to clear the output.') },
      run: async ({ output, source }, ctx) => requireClient(ctx, 'pimatrix').outputs.setOutputSource(cast(output), cast<SetOutputSourceRequest>({ sourceId: source })),
    }),
    defineTool({
      name: 'routing_request_route', title: 'Route a matrix input to an output',
      description: 'Ask the Atlona matrix (through the AMX controller, which stays the only controller of the matrix) to route one numbered input to one numbered output. ' +
        'Fails when the matrix is locked. Read pi://routing/matrix first.',
      permission: write, upstream: 'pimatrix', effect: 'live', idempotent: true,
      input: { input: z.number().int().min(1).describe('Matrix input number.'), output: z.number().int().min(1).describe('Matrix output number.') },
      run: async ({ input, output }, ctx) => requireClient(ctx, 'pimatrix').system.requestMatrixRoute({ input, output }),
    }),
    defineTool({
      name: 'routing_set_multiview', title: 'Change the multiview',
      description: 'Change the multiview: set the layout mode (auto, landscape 4x2 or portrait 2x4) and/or replace one tile with another source ' +
        '(for example put PiPGM3 in the cam3 slot). Give layout, slot or both.',
      permission: write, upstream: 'pimatrix', effect: 'change', idempotent: true,
      input: {
        layout: z.enum(['auto', 'landscape', 'portrait']).optional().describe('Layout mode.'),
        slot: z.object({
          slotIndex: z.number().int().min(0).optional().describe('Tile index, 0-based.'),
          replaceSourceId: sourceId.optional().describe('Source currently in the tile to replace (alternative to slotIndex).'),
          source: sourceId.nullable().describe('Source to show in the tile, or null to restore the default.'),
        }).optional(),
      },
      run: async ({ layout, slot }, ctx) => {
        if (!layout && !slot) throw new Error('Give "layout", "slot" or both.');
        const client = requireClient(ctx, 'pimatrix');
        let result: unknown;
        if (layout) result = await client.outputs.setMultiviewLayout({ layout: cast(layout) });
        if (slot) {
          result = await client.outputs.setMultiviewSlot(cast<MultiviewSlotRequest>({
            sourceId: slot.source,
            ...(slot.slotIndex !== undefined ? { slotIndex: slot.slotIndex } : {}),
            ...(slot.replaceSourceId ? { replaceSourceId: slot.replaceSourceId } : {}),
          }));
        }
        return result;
      },
    }),
    defineTool({
      name: 'routing_set_lock', title: 'Lock or unlock the matrix',
      description: 'Lock or unlock the Atlona matrix. While locked, routing requests are refused. Admin only.',
      permission: admin, upstream: 'pimatrix', effect: 'change', idempotent: true,
      input: { locked: z.boolean() },
      run: async ({ locked }, ctx) => requireClient(ctx, 'pimatrix').outputs.setMatrixLock({ locked }),
    }),
    defineTool({
      name: 'source_set_framing', title: 'Crop or rotate a source',
      description: 'Adjust the framing of a source: crop to a preset (vertical 9:16 or 10:16, landscape, center, reset), move or resize the crop window, set an exact crop, or rotate. ' +
        'Pick one action. Read pi://routing/sources/{id} first to see the current crop. Affects every output that shows this source.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: {
        source: sourceId,
        action: z.enum(['preset', 'move', 'resize', 'set', 'rotate']).describe(
          'preset: use "preset". move: use "direction" (and optional "delta"). resize: use "resizeAction" (and optional "factor"). ' +
          'set: exact crop with "crop". rotate: use "rotation".'),
        preset: z.enum(['force-vertical-9-16', 'force-vertical-10-16', 'force-landscape-16-9', 'force-landscape-16-10', 'center', 'reset']).optional(),
        direction: z.enum(['left', 'right', 'up', 'down', 'center']).optional(),
        delta: z.number().optional().describe('How far to move the crop, in the unit the service uses (see pi://routing/sources/{id}).'),
        resizeAction: z.enum(['in', 'out']).optional(),
        factor: z.number().optional(),
        rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional().describe('Degrees.'),
        crop: z.object({
          enabled: z.boolean().optional(), x: z.number().optional(), y: z.number().optional(),
          width: z.number().optional(), height: z.number().optional(),
          aspectRatio: z.enum(['16:9', '9:16', '16:10', '10:16', '4:3', '1:1', 'free']).optional(),
          lockedAspectRatio: z.boolean().optional(),
        }).optional(),
      },
      run: async (args, ctx) => {
        const effects = requireClient(ctx, 'pimatrix').effects;
        const id = cast<'hama'>(args.source);
        switch (args.action) {
          case 'preset': return effects.applySourceCropPreset(cast(id), cast<CropPresetRequest>({ preset: need(args.preset, 'preset', 'preset') }));
          case 'move': return effects.moveSourceCrop(cast(id), cast<MoveCropRequest>({ direction: need(args.direction, 'direction', 'move'), ...(args.delta !== undefined ? { delta: args.delta } : {}) }));
          case 'resize': return effects.resizeSourceCrop(cast(id), cast<ResizeCropRequest>({ action: need(args.resizeAction, 'resizeAction', 'resize'), ...(args.factor !== undefined ? { factor: args.factor } : {}) }));
          case 'set': return effects.updateSourceCrop(cast(id), cast<UpdateCropRequest>(need(args.crop, 'crop', 'set')));
          case 'rotate': return effects.setSourceRotation(cast(id), cast<SetRotationRequest>({ rotation: need(args.rotation, 'rotation', 'rotate') }));
        }
      },
    }),
    defineTool({
      name: 'output_set_crop', title: 'Crop an output',
      description: 'Set the crop applied on an output (hdmi0, hdmi1 or multiview) rather than on a source. Read pi://routing/outputs/{id} first.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: {
        output: outputId,
        crop: z.object({
          enabled: z.boolean().optional(), x: z.number().optional(), y: z.number().optional(),
          width: z.number().optional(), height: z.number().optional(),
          aspectRatio: z.enum(['16:9', '9:16', '16:10', '10:16', '4:3', '1:1', 'free']).optional(),
          lockedAspectRatio: z.boolean().optional(),
        }),
      },
      run: async ({ output, crop }, ctx) => requireClient(ctx, 'pimatrix').effects.updateOutputCrop(cast(output), cast<UpdateCropRequest>(crop)),
    }),
    defineTool({
      name: 'source_set_blackout_mute', title: 'Fade a source to black or mute it',
      description: 'Fade a source to black and back, and/or mute or unmute its audio. Give "fadeToBlack", "muted", or "toggle" with the field to toggle. Changes what the audience sees or hears.',
      permission: write, upstream: 'pimatrix', effect: 'live', idempotent: true,
      input: {
        source: sourceId,
        fadeToBlack: z.boolean().optional().describe('true fades to black, false restores the picture.'),
        muted: z.boolean().optional().describe('true mutes the source audio, false restores it.'),
        toggle: z.enum(['fadeToBlack', 'muted']).optional().describe('Toggle one of the two instead of setting it.'),
      },
      run: async ({ source, fadeToBlack, muted, toggle }, ctx) => {
        if (fadeToBlack === undefined && muted === undefined && !toggle) throw new Error('Give "fadeToBlack", "muted" or "toggle".');
        const effects = requireClient(ctx, 'pimatrix').effects;
        const results: Record<string, unknown> = {};
        if (fadeToBlack !== undefined) results.fadeToBlack = await effects.setSourceFadeToBlack(source, { fadeToBlack });
        if (muted !== undefined) results.muted = await effects.setSourceMute(source, { muted });
        if (toggle === 'fadeToBlack') results.fadeToBlack = await effects.setSourceFadeToBlack(source, { toggle: true });
        if (toggle === 'muted') results.muted = await effects.setSourceMute(source, { toggle: true });
        return results;
      },
    }),
    defineTool({
      name: 'rtsp_output_control', title: 'Control the RTSP output',
      description: 'Choose the source of the RTSP output and/or start or stop its stream. Read pi://routing/outputs for its current state.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: {
        source: sourceId.nullable().optional().describe('Source for the RTSP output, or null to clear it.'),
        streaming: z.boolean().optional().describe('true starts and false stops the RTSP stream.'),
      },
      run: async ({ source, streaming }, ctx) => {
        if (source === undefined && streaming === undefined) throw new Error('Give "source", "streaming" or both.');
        const outputs = requireClient(ctx, 'pimatrix').outputs;
        let result: unknown;
        if (source !== undefined) result = await outputs.setRtspOutputSource({ sourceId: source } as never);
        if (streaming !== undefined) result = await outputs.toggleRtspStream({ streaming });
        return result;
      },
    }),
  ],
};
