import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const view = { domain: 'world', level: 'view' } as const;
const operate = { domain: 'world', level: 'operate' } as const;

export const worldDomain: DomainModule = {
  resources: [
    {
      name: 'world-state',
      uri: 'pi://world/state',
      title: 'Fused World State',
      description: 'Multi-modal fused state: active speaker detection (fusion, voice, dsp, spatial, none), tracked 3D subjects, active sanctuary zones, audio meters, switcher status, and liturgical rundown cue.',
      permission: view,
      upstream: 'pigateway',
      read: async ctx => json(await requireClient(ctx, 'pigateway').getWorldState()),
    },
    {
      name: 'gateway-status',
      uri: 'pi://gateway/status',
      title: 'Gateway Hardware & Broker Status',
      description: 'Physical device connection states (ATEM, PTZ, AMX, DSP, audio/VAD UDP sockets) and subsystem availability.',
      permission: view,
      upstream: 'pigateway',
      read: async ctx => json(await requireClient(ctx, 'pigateway').getStatus()),
    },
  ],
  tools: [
    defineTool({
      name: 'world_refresh',
      title: 'Refresh World State',
      description: 'Forces an immediate poll and recalculation of the multi-sensor world state aggregator in pigateway.',
      permission: operate,
      upstream: 'pigateway',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pigateway').refreshWorldState(),
    }),
  ],
};
