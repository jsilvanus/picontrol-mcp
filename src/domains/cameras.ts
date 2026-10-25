import { z } from 'zod';
import type { CameraMoveRequest, CameraPrivacyBlurRequest, CameraSmartFrameRequest, CameraZoomRequest } from '../generated/pimatrix/index.js';
import { allows } from '../users/permissions.js';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { cameraId, cast, json } from './util.js';

const read = { domain: 'cameras', level: 'read' } as const;
const write = { domain: 'cameras', level: 'write' } as const;
const admin = { domain: 'cameras', level: 'admin' } as const;

const preset = z.number().int().min(0).max(254).describe('Preset number 0-254. Read pi://cameras/{id} for the named presets.');

export const cameras: DomainModule = {
  resources: [
    {
      name: 'cameras', uri: 'pi://cameras', title: 'Cameras',
      description: 'All PTZ cameras with connection state, position and stream state.',
      permission: read, upstream: 'pimatrix',
      read: async ctx => json(await requireClient(ctx, 'pimatrix').cameras.listCameras()),
    },
    {
      name: 'camera', uri: 'pi://cameras/{id}', title: 'One camera',
      description: 'One camera (cam1, cam2 or cam3) with its presets, position and stream state.',
      permission: read, upstream: 'pimatrix',
      read: async (ctx, vars) => json(await requireClient(ctx, 'pimatrix').cameras.getCamera(cast(vars.id))),
    },
  ],
  tools: [
    defineTool({
      name: 'camera_move', title: 'Move a camera',
      description: 'Pan and tilt a camera in a direction, stop it, send it home, or reset it. Movement continues until you call this again with direction "stop", so always finish with a stop. ' +
        'If the camera is on air the audience sees the move.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: {
        camera: cameraId,
        direction: z.enum(['up', 'down', 'left', 'right', 'upleft', 'upright', 'downleft', 'downright', 'stop', 'home', 'reset']),
        panSpeed: z.number().optional().describe('Pan speed; omit for the default.'),
        tiltSpeed: z.number().optional().describe('Tilt speed; omit for the default.'),
      },
      run: async ({ camera, direction, panSpeed, tiltSpeed }, ctx) => requireClient(ctx, 'pimatrix').cameras.moveCamera(cast(camera), cast<CameraMoveRequest>({
        direction,
        ...(panSpeed !== undefined ? { panSpeed } : {}),
        ...(tiltSpeed !== undefined ? { tiltSpeed } : {}),
      })),
    }),
    defineTool({
      name: 'camera_zoom', title: 'Zoom a camera',
      description: 'Zoom a camera in or out, or stop the zoom. Zooming continues until you call this with action "stop", so always finish with a stop.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: { camera: cameraId, action: z.enum(['in', 'out', 'stop']), speed: z.number().optional() },
      run: async ({ camera, action, speed }, ctx) => requireClient(ctx, 'pimatrix').cameras.zoomCamera(cast(camera), cast<CameraZoomRequest>({ action, ...(speed !== undefined ? { speed } : {}) })),
    }),
    defineTool({
      name: 'camera_preset', title: 'Camera presets',
      description: 'Recall a stored camera position (recall), store the current position as a preset (save), or take a thumbnail of a preset (thumbnail). ' +
        'Recall is the normal way to frame a shot. Save overwrites the stored position and needs the admin role for cameras; thumbnail changes nothing on air.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: { camera: cameraId, action: z.enum(['recall', 'save', 'thumbnail']), preset, name: z.string().max(60).optional().describe('Name stored with the preset (save only).') },
      run: async ({ camera, action, preset: number, name }, ctx) => {
        const cameras = requireClient(ctx, 'pimatrix').cameras;
        if (action === 'recall') return cameras.recallCameraPreset(cast(camera), number);
        if (action === 'thumbnail') return cameras.captureCameraPresetThumbnail(camera, String(number));
        if (!allows(ctx.user.rights, admin)) throw new Error('Saving a camera preset needs the admin role for cameras.');
        return cameras.saveCameraPreset(cast(camera), number, name ? { name } : undefined);
      },
    }),
    defineTool({
      name: 'camera_set_smartframe', title: 'Camera smart framing',
      description: 'Enable or disable the camera\'s smart framing (auto-framing), or trigger one framing pass.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: { camera: cameraId, mode: z.enum(['enable', 'disable', 'trigger']) },
      run: async ({ camera, mode }, ctx) => requireClient(ctx, 'pimatrix').cameras.setCameraSmartFrame(cast(camera), cast<CameraSmartFrameRequest>({ mode })),
    }),
    defineTool({
      name: 'camera_privacy_blur', title: 'Camera privacy blur',
      description: 'Blur the camera picture for privacy: on switches autofocus to manual focus, sets the near limit to the closest distance and drives focus to the nearest point; off returns the camera to autofocus. Uses standard VISCA focus commands, not yet verified on the real cameras.',
      permission: write, upstream: 'pimatrix', effect: 'live', idempotent: true,
      input: { camera: cameraId, enabled: z.boolean().describe('true = blur, false = back to autofocus') },
      run: async ({ camera, enabled }, ctx) => requireClient(ctx, 'pimatrix').cameras.setCameraPrivacyBlur(cast(camera), cast<CameraPrivacyBlurRequest>({ enabled })),
    }),
    defineTool({
      name: 'camera_stream', title: 'Start or stop a camera stream',
      description: 'Start or stop the camera\'s RTMP stream to the Pi (the picture other sources and the ATEM path depend on). Read pi://cameras/{id} for the stream state.',
      permission: write, upstream: 'pimatrix', effect: 'live', idempotent: true,
      input: { camera: cameraId, action: z.enum(['start', 'stop']) },
      run: async ({ camera, action }, ctx) => {
        const cameras = requireClient(ctx, 'pimatrix').cameras;
        return action === 'start' ? cameras.startCameraStream(cast(camera)) : cameras.stopCameraStream(cast(camera));
      },
    }),
  ],
};
