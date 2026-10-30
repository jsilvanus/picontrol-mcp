import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { cameraId, json } from './util.js';

const view = { domain: 'space', level: 'view' } as const;
const operate = { domain: 'space', level: 'operate' } as const;
const setup = { domain: 'space', level: 'setup', scope: 'hardware' } as const;

export const spaceDomain: DomainModule = {
  resources: [
    {
      name: 'space-spatial',
      uri: 'pi://space/spatial',
      title: '3D Spatial Twin & Subjects',
      description: '3D venue state: tracked subjects with metric (X, Y, Z) coordinates, velocities, and current zone memberships.',
      permission: view,
      upstream: 'pispace',
      read: async ctx => json(await requireClient(ctx, 'pispace').getSpatial()),
    },
    {
      name: 'space-zones',
      uri: 'pi://space/zones',
      title: 'Venue 3D Zones',
      description: 'Defined geometric boundaries of sanctuary zones: pulpit, lectern, altar, communion rail, choir, and seating.',
      permission: view,
      upstream: 'pispace',
      read: async ctx => json(await requireClient(ctx, 'pispace').getZones()),
    },
    {
      name: 'space-cameras',
      uri: 'pi://space/cameras',
      title: 'FreeD Tracking Cameras',
      description: 'FreeD tracking camera positions (X, Y, Z), orientations (pan, tilt, roll), and optical parameters (focal length, zoom, focus).',
      permission: view,
      upstream: 'pispace',
      read: async ctx => json(await requireClient(ctx, 'pispace').getCameras()),
    },
  ],
  tools: [
    defineTool({
      name: 'space_frame_subject',
      title: 'Frame 3D Target or Zone',
      description: 'Solves inverse PTZ geometry to automatically aim and frame a camera at a tracked person ID, 3D coordinate, or named zone with the requested shot framing.',
      permission: operate,
      upstream: 'pispace',
      effect: 'live',
      input: {
        camera: cameraId,
        target: z.object({
          subjectId: z.number().int().optional().describe('Tracked person track ID'),
          zone: z.enum(['pulpit', 'lectern', 'altar', 'communion_rail', 'choir']).optional().describe('Named venue zone'),
          coordinates: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional().describe('Direct 3D coordinate (meters)'),
        }),
        framing: z.enum(['wide', 'medium', 'tight', 'close_up']).default('medium').describe('Requested shot framing composition'),
      },
      run: async ({ camera, target, framing }, ctx) =>
        requireClient(ctx, 'pispace').frameSubject(camera, { target, framing }),
    }),
    defineTool({
      name: 'space_calibrate_freed',
      title: 'Calibrate FreeD Camera Tracking',
      description: 'Hardware setup: zeroes or offsets pan/tilt/roll angles and positional coordinates for a FreeD camera. Available only to hardware setup agents.',
      permission: setup,
      upstream: 'pispace',
      effect: 'change',
      idempotent: true,
      input: {
        camera: cameraId,
        zeroOrientation: z.boolean().optional().describe('Set current pan/tilt as reference zero'),
        offsetPan: z.number().optional().describe('Pan calibration offset degrees'),
        offsetTilt: z.number().optional().describe('Tilt calibration offset degrees'),
        offsetZoom: z.number().optional().describe('Optical zoom scale factor'),
      },
      run: async ({ camera, ...offsets }, ctx) =>
        requireClient(ctx, 'pispace').calibrateFreed(camera, offsets),
    }),
  ],
};
