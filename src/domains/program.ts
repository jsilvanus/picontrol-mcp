import { z } from 'zod';
import type {
  CreatePiPgmCanvaRequest, CreatePiPgmHymnRequest, CreatePiPgmMediaRequest, CreatePiPgmPptxRequest, CreatePiPgmYouTubeRequest,
  PiPgmAudioRequest, PiPgmCanvaControlRequest, PiPgmControlRequest, PiPgmFtbRequest, PiPgmPipelineConfigRequest,
} from '../generated/pimatrix/index.js';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { cast, json, need, pipelineId } from './util.js';

const read = { domain: 'program', level: 'read' } as const;
const write = { domain: 'program', level: 'write' } as const;
const admin = { domain: 'program', level: 'admin' } as const;

const placement = {
  targetPipelineId: pipelineId.optional().describe('Pipeline to put the new item on; omit to only add it to the library.'),
  cueImmediately: z.boolean().optional().describe('true makes the item the current one on that pipeline at once.'),
};

export const program: DomainModule = {
  resources: [
    {
      name: 'program-pipelines', uri: 'pi://program/pipelines', title: 'Program pipelines',
      description: 'The PiPGM program pipelines (PiPGM1-3): current item, step, playlist, fade-to-black, audio and orientation.',
      permission: read, upstream: 'pimatrix',
      read: async ctx => json(await requireClient(ctx, 'pimatrix').piPgm.listPiPgmPipelines(true)),
    },
    {
      name: 'program-pipeline', uri: 'pi://program/pipelines/{id}', title: 'One program pipeline',
      description: 'One pipeline (PiPGM1, PiPGM2 or PiPGM3) with its playlist and current position.',
      permission: read, upstream: 'pimatrix',
      read: async (ctx, vars) => json(await requireClient(ctx, 'pimatrix').piPgm.getPiPgmPipeline(cast(vars.id))),
    },
    {
      name: 'program-items', uri: 'pi://program/items', title: 'Program items',
      description: 'The item library: hymns, YouTube clips, media, PowerPoint decks and Canva designs that can be put on a pipeline.',
      permission: read, upstream: 'pimatrix',
      read: async ctx => json(await requireClient(ctx, 'pimatrix').piPgm.listPiPgmItems()),
    },
    {
      name: 'program-item', uri: 'pi://program/items/{id}', title: 'One program item',
      description: 'One library item with its slides or steps.',
      permission: read, upstream: 'pimatrix',
      read: async (ctx, vars) => json(await requireClient(ctx, 'pimatrix').piPgm.getPiPgmItem(vars.id!)),
    },
  ],
  tools: [
    defineTool({
      name: 'program_control', title: 'Control a program pipeline',
      description: 'Step through what a pipeline shows: next/prev step, go to a step or item, play, pause, stop or restart. ' +
        'Changes the picture on air if the pipeline is on air. Read pi://program/pipelines/{id} first for the current step and playlist.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: {
        pipeline: pipelineId,
        action: z.enum(['next', 'prev', 'gotoStep', 'gotoItem', 'play', 'pause', 'stop', 'restart']),
        stepIndex: z.number().int().min(0).optional().describe('For gotoStep (0-based).'),
        itemId: z.string().optional().describe('For gotoItem: id from the playlist.'),
        itemIndex: z.number().int().min(0).optional().describe('For gotoItem, instead of itemId (0-based).'),
        advanceItemOnEnd: z.boolean().optional(),
        sync: z.boolean().optional().describe('Apply to linked pipelines too.'),
      },
      run: async ({ pipeline, ...body }, ctx) => {
        if (body.action === 'gotoStep') need(body.stepIndex, 'stepIndex', 'gotoStep');
        if (body.action === 'gotoItem' && body.itemId === undefined && body.itemIndex === undefined) throw new Error('"itemId" or "itemIndex" is required for action "gotoItem".');
        return requireClient(ctx, 'pimatrix').piPgm.controlPiPgmPipeline(cast(pipeline), cast<PiPgmControlRequest>(body));
      },
    }),
    defineTool({
      name: 'program_set_fade_to_black', title: 'Fade a pipeline to black',
      description: 'Fade a pipeline to black or back. Give "fadeToBlack" to set it, or toggle=true to flip it.',
      permission: write, upstream: 'pimatrix', effect: 'live', idempotent: true,
      input: { pipeline: pipelineId, fadeToBlack: z.boolean().optional(), toggle: z.boolean().optional(), durationMs: z.number().int().min(0).optional(), sync: z.boolean().optional() },
      run: async ({ pipeline, ...body }, ctx) => {
        if (body.fadeToBlack === undefined && !body.toggle) throw new Error('Give "fadeToBlack" or toggle=true.');
        return requireClient(ctx, 'pimatrix').piPgm.setPiPgmFadeToBlack(cast(pipeline), cast<PiPgmFtbRequest>(body));
      },
    }),
    defineTool({
      name: 'program_set_audio', title: 'Pipeline audio',
      description: 'Enable, mute or toggle a pipeline\'s audio and set its volume.',
      permission: write, upstream: 'pimatrix', effect: 'live', idempotent: true,
      input: { pipeline: pipelineId, audioEnabled: z.boolean().optional(), toggle: z.boolean().optional(), volume: z.number().min(0).max(1).optional().describe('0-1.'), sync: z.boolean().optional() },
      run: async ({ pipeline, ...body }, ctx) => {
        if (body.audioEnabled === undefined && !body.toggle && body.volume === undefined) throw new Error('Give "audioEnabled", "toggle" or "volume".');
        return requireClient(ctx, 'pimatrix').piPgm.setPiPgmAudio(cast(pipeline), cast<PiPgmAudioRequest>(body));
      },
    }),
    defineTool({
      name: 'program_playlist', title: 'Edit a pipeline playlist',
      description: 'Add a library item to a pipeline\'s playlist, or remove one. Item ids come from pi://program/items.',
      permission: write, upstream: 'pimatrix', effect: 'change',
      input: { pipeline: pipelineId, action: z.enum(['add', 'remove']), itemId: z.string(), cueImmediately: z.boolean().optional().describe('add only: make it the current item at once.') },
      run: async ({ pipeline, action, itemId, cueImmediately }, ctx) => {
        const piPgm = requireClient(ctx, 'pimatrix').piPgm;
        return action === 'add'
          ? piPgm.addPiPgmPlaylistItem(cast(pipeline), { itemId, ...(cueImmediately !== undefined ? { cueImmediately } : {}) })
          : piPgm.removePiPgmPlaylistItem(cast(pipeline), itemId);
      },
    }),
    defineTool({
      name: 'program_create_item', title: 'Create a program item',
      description: 'Create a library item and optionally put it on a pipeline. kind "hymn": title plus stanzas (lines) or rawText. kind "youtube": urlOrId. ' +
        'kind "media": filename plus dataBase64 (small files only). kind "pptx": slides as text, or filename plus dataBase64. kind "canva": design links. ' +
        'The tool description of each field is in "details". Set cueImmediately only when the item should appear now.',
      permission: write, upstream: 'pimatrix', effect: 'change',
      input: {
        kind: z.enum(['hymn', 'youtube', 'media', 'pptx', 'canva']),
        details: z.record(z.string(), z.unknown()).describe(
          'hymn: {title, hymnNumber?, includeTitleSlide?, rawText?, stanzas?: [{stanzaNumber?, lines[], refrain?}]}. ' +
          'youtube: {urlOrId, title?, startSeconds?, endSeconds?, autoplay?, loop?}. ' +
          'media: {kind: "video"|"image", filename, dataBase64, mimeType?, fit?, caption?, durationMs?, autoplay?, loop?}. ' +
          'pptx: {filename, title?, dataBase64? or slides?: [{slideNumber?, title, bullets?, notes?}], animateBulletsByDefault?}. ' +
          'canva: {designId?, title?, embedUrl?, viewUrl?, pageCount?, exportUrls?, mode?: "embed"|"exported_mp4"|"exported_slides"}.'),
        ...placement,
      },
      run: async ({ kind, details, targetPipelineId, cueImmediately }, ctx) => {
        const piPgm = requireClient(ctx, 'pimatrix').piPgm;
        const body = { ...details, ...(targetPipelineId ? { targetPipelineId } : {}), ...(cueImmediately !== undefined ? { cueImmediately } : {}) };
        switch (kind) {
          case 'hymn': return piPgm.createPiPgmHymnItem(cast<CreatePiPgmHymnRequest>(body));
          case 'youtube': return piPgm.createPiPgmYouTubeItem(cast<CreatePiPgmYouTubeRequest>(body));
          case 'media': return piPgm.createPiPgmMediaItem(cast<CreatePiPgmMediaRequest>(body));
          case 'pptx': return piPgm.createPiPgmPptxItem(cast<CreatePiPgmPptxRequest>(body));
          case 'canva': return piPgm.createPiPgmCanvaItem(cast<CreatePiPgmCanvaRequest>(body));
        }
      },
    }),
    defineTool({
      name: 'program_configure_pipeline', title: 'Configure a pipeline',
      description: 'Change a pipeline\'s settings: orientation (landscape/portrait), hidden, linked to the other pipelines, fade duration. Admin only.',
      permission: admin, upstream: 'pimatrix', effect: 'change', idempotent: true,
      input: { pipeline: pipelineId, orientation: z.enum(['landscape', 'portrait']).optional(), hidden: z.boolean().optional(), linked: z.boolean().optional(), fadeDurationMs: z.number().int().min(0).optional() },
      run: async ({ pipeline, ...body }, ctx) => requireClient(ctx, 'pimatrix').piPgm.updatePiPgmPipelineConfig(cast(pipeline), cast<PiPgmPipelineConfigRequest>(body)),
    }),
    defineTool({
      name: 'slides_canva_control', title: 'Control a Canva presentation',
      description: 'Drive the Canva presentation on the pipelines: next/prev, go to a page or step, fade to black, mute, play/pause/stop/restart, or switch the render mode. ' +
        'Without designId/targetPipelineId it targets the active pipelines.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: {
        action: z.enum(['next', 'prev', 'gotoPage', 'gotoStep', 'ftb', 'mute', 'play', 'pause', 'stop', 'restart', 'mode']),
        designId: z.string().optional(),
        targetPipelineId: z.string().optional().describe('PiPGM1, PiPGM2, PiPGM3 or "all".'),
        pageNumber: z.number().int().min(1).optional().describe('gotoPage, 1-based.'),
        stepIndex: z.number().int().min(0).optional(),
        fadeToBlack: z.boolean().optional(), ftbToggle: z.boolean().optional(),
        audioEnabled: z.boolean().optional(), muteToggle: z.boolean().optional(),
        mode: z.enum(['embed', 'exported_mp4', 'exported_slides']).optional(),
        sync: z.boolean().optional(),
      },
      run: async (args, ctx) => requireClient(ctx, 'pimatrix').piPgm.controlPiPgmCanvaPresentation(cast<PiPgmCanvaControlRequest>(args)),
    }),
    defineTool({
      name: 'slides_canva_push', title: 'Push a Canva design',
      description: 'Add a Canva design to the library and optionally cue it on a pipeline. Same fields as program_create_item with kind "canva".',
      permission: write, upstream: 'pimatrix', effect: 'change',
      input: { details: z.record(z.string(), z.unknown()).describe('{designId?, title?, embedUrl?, viewUrl?, pageCount?, exportUrls?, mode?, autoExport?}'), ...placement },
      run: async ({ details, targetPipelineId, cueImmediately }, ctx) => requireClient(ctx, 'pimatrix').piPgm.pushPiPgmCanvaDesign(cast<CreatePiPgmCanvaRequest>({
        ...details, ...(targetPipelineId ? { targetPipelineId } : {}), ...(cueImmediately !== undefined ? { cueImmediately } : {}),
      })),
    }),
  ],
};
