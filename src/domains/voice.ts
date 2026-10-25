import { z } from 'zod';
import type { ConfigPatch } from '../generated/pivoice/index.js';
import { defineTool, requireClient, type DomainContext, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const read = { domain: 'voice', level: 'read' } as const;
const write = { domain: 'voice', level: 'write' } as const;
const admin = { domain: 'voice', level: 'admin' } as const;

const mode = z.enum(['on', 'off', 'auto']).describe('on: always; off: never; auto: while speech is detected (for YouTube captions: while the stream is online).');

interface RadioTargetLike { id: string; [key: string]: unknown }

/** Radio targets are an array that pivoice replaces as a whole, so the tool reads it and writes the changed copy back. */
async function setRadioModes(ctx: DomainContext, target: string | undefined, next: 'on' | 'off' | 'auto') {
  const voice = requireClient(ctx, 'pivoice').system;
  const config = await voice.getConfig();
  const targets = ((config.radio as { targets?: RadioTargetLike[] } | undefined)?.targets ?? []);
  if (targets.length === 0) throw new Error('No web radio targets are configured in pivoice.');
  if (target && !targets.some(entry => entry.id === target)) {
    throw new Error(`Unknown radio target "${target}" (known: ${targets.map(entry => entry.id).join(', ')}).`);
  }
  const updated = targets.map(entry => (!target || entry.id === target ? { ...entry, mode: next } : entry));
  await voice.updateConfig({ radio: { targets: updated } });
  return requireClient(ctx, 'pivoice').radio.getRadio();
}

export const voiceDomain: DomainModule = {
  resources: [
    {
      name: 'voice-status', uri: 'pi://voice/status', title: 'Voice status',
      description: 'pivoice overall: capture state, voice detection, and the running state of web radio, transcription and captions.',
      permission: read, upstream: 'pivoice',
      read: async ctx => json(await requireClient(ctx, 'pivoice').system.getStatus()),
    },
    {
      name: 'voice-radio', uri: 'pi://voice/radio', title: 'Web radio',
      description: 'Web radio targets with mode (on/off/auto) and state (off, waiting, running, ...).',
      permission: read, upstream: 'pivoice',
      read: async ctx => json(await requireClient(ctx, 'pivoice').radio.getRadio()),
    },
    {
      name: 'voice-captions', uri: 'pi://voice/captions', title: 'Caption delivery',
      description: 'Caption delivery to web-radio-relay and YouTube: configured, running, sent/failed counts, last error.',
      permission: read, upstream: 'pivoice',
      read: async ctx => json(await requireClient(ctx, 'pivoice').captions.getCaptionsStatus()),
    },
    {
      name: 'voice-devices', uri: 'pi://voice/devices', title: 'Audio devices',
      description: 'ALSA capture devices pivoice can see (find the Hama card here; do not assume a card index).',
      permission: read, upstream: 'pivoice',
      read: async ctx => json(await requireClient(ctx, 'pivoice').capture.listAudioDevices()),
    },
    {
      name: 'voice-config', uri: 'pi://voice/config', title: 'Voice configuration',
      description: 'pivoice configuration. Secrets, tokens and stream keys are shown as ***.',
      permission: { domain: 'voice', level: 'admin' }, upstream: 'pivoice',
      read: async ctx => json(await requireClient(ctx, 'pivoice').system.getConfig()),
    },
  ],
  tools: [
    defineTool({
      name: 'voice_set_radio_mode', title: 'Web radio on, off or auto',
      description: 'Set the web radio mode for one target (for example "local" or "relay") or, when "target" is omitted, for every target. ' +
        'Read pi://voice/radio for the target ids. "auto" streams only while speech is detected.',
      permission: write, upstream: 'pivoice', effect: 'live', idempotent: true,
      input: { mode, target: z.string().optional().describe('Radio target id; omit for all targets.') },
      run: async ({ mode: next, target }, ctx) => setRadioModes(ctx, target, next),
    }),
    defineTool({
      name: 'voice_set_transcription_mode', title: 'Transcription on, off or auto',
      description: 'Set the live transcription mode ("auto" transcribes only chunks with speech) and optionally the language (for example "fi"). ' +
        'Read pi://voice/status for the current state.',
      permission: write, upstream: 'pivoice', effect: 'change', idempotent: true,
      input: { mode, language: z.string().min(2).max(10).optional() },
      run: async ({ mode: next, language }, ctx) => {
        const voice = requireClient(ctx, 'pivoice');
        await voice.system.updateConfig({ auditor: { mode: next, ...(language ? { language } : {}) } });
        return voice.system.getStatus();
      },
    }),
    defineTool({
      name: 'voice_set_captions_mode', title: 'Caption delivery on, off or auto',
      description: 'Set caption delivery to the web-radio-relay or to YouTube. For YouTube, "auto" sends while the stream is online, and the stream key must already be configured ' +
        '(see pi://voice/captions "configured"). Read pi://voice/captions afterwards to confirm it is running.',
      permission: write, upstream: 'pivoice', effect: 'live', idempotent: true,
      input: { destination: z.enum(['relay', 'youtube']), mode },
      run: async ({ destination, mode: next }, ctx) => {
        const voice = requireClient(ctx, 'pivoice');
        await voice.system.updateConfig({ captions: { [destination]: { mode: next } } });
        return voice.captions.getCaptionsStatus();
      },
    }),
    defineTool({
      name: 'voice_capture', title: 'Start or stop audio capture',
      description: 'Start or stop capturing the microphone. Stopping capture silences web radio, transcription and captions together.',
      permission: write, upstream: 'pivoice', effect: 'live', idempotent: true,
      input: { action: z.enum(['start', 'stop']) },
      run: async ({ action }, ctx) => {
        const capture = requireClient(ctx, 'pivoice').capture;
        return action === 'start' ? capture.startCapture() : capture.stopCapture();
      },
    }),
    defineTool({
      name: 'voice_configure', title: 'Change the voice configuration',
      description: 'Partial change of the pivoice configuration (capture device, radio bitrate/targets, auditor URL and key, caption relay URL and token, YouTube stream key). ' +
        'Nested objects merge, arrays are replaced. Secrets can be set but are never shown again. Admin only; use the mode tools for ordinary on/off/auto changes.',
      permission: admin, upstream: 'pivoice', effect: 'change',
      input: { patch: z.object({
        capture: z.record(z.string(), z.unknown()).optional(), radio: z.record(z.string(), z.unknown()).optional(),
        auditor: z.record(z.string(), z.unknown()).optional(), captions: z.record(z.string(), z.unknown()).optional(),
      }) },
      run: async ({ patch }, ctx) => requireClient(ctx, 'pivoice').system.updateConfig(patch as ConfigPatch),
    }),
  ],
};
