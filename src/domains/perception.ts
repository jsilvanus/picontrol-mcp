import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const view = { domain: 'perception', level: 'view' } as const;
const setup = { domain: 'perception', level: 'setup', scope: 'hardware' } as const;

export const perceptionDomain: DomainModule = {
  resources: [
    {
      name: 'perception-status',
      uri: 'pi://perception/status',
      title: 'Neural Perception Status',
      description: 'YOLOX detector inference FPS, active camera inputs, tracking engine status (ByteTrack). Never emits images or video frames.',
      permission: view,
      upstream: 'piperception',
      read: async ctx => json(await requireClient(ctx, 'piperception').getStatus()),
    },
    {
      name: 'perception-detections',
      uri: 'pi://perception/detections',
      title: '2D Visual Detections',
      description: 'Geometric metadata only: normalized 2D bounding boxes ([x, y, w, h]), track IDs, and confidence scores across cameras.',
      permission: view,
      upstream: 'piperception',
      read: async ctx => json(await requireClient(ctx, 'piperception').getDetections()),
    },
  ],
  tools: [
    defineTool({
      name: 'perception_configure',
      title: 'Configure Neural Perception Detector',
      description: 'Hardware/Vision setup: updates detection confidence threshold, NMS IoU threshold, and ByteTrack track buffer. Setup role only.',
      permission: setup,
      upstream: 'piperception',
      effect: 'change',
      idempotent: true,
      input: {
        scoreThreshold: z.number().min(0.1).max(1.0).optional().describe('Minimum confidence threshold for person detection'),
        nmsThreshold: z.number().min(0.1).max(1.0).optional().describe('IoU threshold for non-maximum suppression'),
        trackBuffer: z.number().int().min(10).max(120).optional().describe('Frames to keep lost track before discarding'),
      },
      run: async (config, ctx) => requireClient(ctx, 'piperception').configure(config),
    }),
  ],
};
