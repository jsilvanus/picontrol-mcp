import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const view = { domain: 'sound', level: 'view' } as const;
const operateChurch = { domain: 'sound', level: 'operate', scope: 'church' } as const;

export const soundDomain: DomainModule = {
  resources: [
    {
      name: 'sound-channels',
      uri: 'pi://sound/channels',
      title: 'Microphone & Audio Channels',
      description: 'BSS Soundweb London DSP audio channels: handheld wireless mics (Kapula 1-4), headset mics (Madonna 1-10), pulpit, altar, lectern, and organ. Shows mute states and dBFS audio meters. Zero raw audio transmitted.',
      permission: view,
      upstream: 'pisound',
      read: async ctx => json(await requireClient(ctx, 'pisound').getChannels()),
    },
  ],
  tools: [
    defineTool({
      name: 'sound_set_mute',
      title: 'Mute or Unmute Microphone',
      description: 'Mute or unmute an in-sanctuary microphone channel on the BSS Soundweb DSP. Requires church scope.',
      permission: operateChurch,
      upstream: 'pisound',
      effect: 'live',
      idempotent: true,
      input: {
        channelId: z.string().describe('Channel ID or name, e.g. "altar", "pulpit", "kapula1", "madonna1"'),
        mute: z.boolean().describe('true = muted, false = unmuted (live on air)'),
      },
      run: async ({ channelId, mute }, ctx) =>
        requireClient(ctx, 'pisound').setMute(channelId, mute),
    }),
    defineTool({
      name: 'sound_set_gain',
      title: 'Set Microphone Gain Level',
      description: 'Adjusts the DSP fader gain in dB for a microphone channel. Requires church scope.',
      permission: operateChurch,
      upstream: 'pisound',
      effect: 'live',
      idempotent: true,
      input: {
        channelId: z.string().describe('Channel ID or name'),
        gainDb: z.number().min(-72).max(12).describe('Target gain in decibels (-72 dB to +12 dB)'),
      },
      run: async ({ channelId, gainDb }, ctx) =>
        requireClient(ctx, 'pisound').setGain(channelId, gainDb),
    }),
    defineTool({
      name: 'sound_recall_preset',
      title: 'Recall Audio DSP Preset',
      description: 'Switches the Soundweb routing preset (e.g. "sanctuary_automix", "console_sq5", "choir_service"). Requires church scope.',
      permission: operateChurch,
      upstream: 'pisound',
      effect: 'live',
      idempotent: true,
      input: {
        preset: z.string().describe('Preset name'),
      },
      run: async ({ preset }, ctx) =>
        requireClient(ctx, 'pisound').recallPreset(preset),
    }),
  ],
};
