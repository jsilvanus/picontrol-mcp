import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const read = { domain: 'timer', level: 'read' } as const;
const write = { domain: 'timer', level: 'write' } as const;
const admin = { domain: 'timer', level: 'admin' } as const;

export const timerDomain: DomainModule = {
  resources: [
    {
      name: 'timer-status',
      uri: 'pi://timer/status',
      title: 'PiTimer system automation and mute status',
      description: 'System health, global mute/snooze status, registered timer count, and active execution runs.',
      permission: read,
      upstream: 'pitimer',
      read: async ctx => json(await requireClient(ctx, 'pitimer').getStatus()),
    },
    {
      name: 'timer-list',
      uri: 'pi://timer/timers',
      title: 'Configured deterministic timers',
      description: 'List of all active and paused timer definitions with schedules and lead warning configurations.',
      permission: read,
      upstream: 'pitimer',
      read: async ctx => json(await requireClient(ctx, 'pitimer').listTimers()),
    },
    {
      name: 'timer-runs',
      uri: 'pi://timer/runs',
      title: 'Timer execution history and active runs',
      description: 'Recent run records, executed step outputs, exit codes, and timestamps.',
      permission: read,
      upstream: 'pitimer',
      read: async ctx => json(await requireClient(ctx, 'pitimer').listRuns()),
    },
  ],

  tools: [
    defineTool({
      name: 'timer_status',
      title: 'Get PiTimer status',
      description: 'Check PiTimer automation status, whether timers are muted or active, and run counters.',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pitimer').getStatus(),
    }),

    defineTool({
      name: 'timer_mute',
      title: 'Mute or snooze timers',
      description: 'Temporarily or permanently disable automated timer execution (globally, or for an individual timer by ID).',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {
        id: z.string().optional().describe('Optional specific timer ID to mute. If omitted, mutes all timers globally.'),
        duration: z.enum(['1h', '8h', '24h', '1w', 'permanent']).optional().describe('Snooze duration: "1h", "8h", "24h", "1w", or "permanent"'),
      },
      run: async (args, ctx) =>
        args.id
          ? requireClient(ctx, 'pitimer').muteTimer(args.id, args.duration)
          : requireClient(ctx, 'pitimer').mute(args.duration),
    }),

    defineTool({
      name: 'timer_unmute',
      title: 'Unmute and enable timers',
      description: 'Clear snooze/mute state (globally, or for an individual timer by ID), re-enabling automated schedule evaluations and lead warnings.',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {
        id: z.string().optional().describe('Optional specific timer ID to unmute. If omitted, unblocks all timers globally.'),
      },
      run: async (args, ctx) =>
        args.id
          ? requireClient(ctx, 'pitimer').unmuteTimer(args.id)
          : requireClient(ctx, 'pitimer').unmute(),
    }),

    defineTool({
      name: 'timer_disable',
      title: 'Totally disable a timer',
      description: 'Completely disable an individual timer so it does not trigger until manually re-enabled.',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {
        id: z.string().describe('Timer identifier to disable'),
      },
      run: async (args, ctx) => requireClient(ctx, 'pitimer').updateTimer(args.id, { enabled: false }),
    }),

    defineTool({
      name: 'timer_enable',
      title: 'Enable a timer',
      description: 'Re-enable a previously disabled timer and clear any active snooze.',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {
        id: z.string().describe('Timer identifier to enable'),
      },
      run: async (args, ctx) => requireClient(ctx, 'pitimer').updateTimer(args.id, { enabled: true, mutedUntil: null }),
    }),

    defineTool({
      name: 'timer_list',
      title: 'List configured timers',
      description: 'Retrieve all configured timer definitions, schedules, and lead warning stages.',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pitimer').listTimers(),
    }),

    defineTool({
      name: 'timer_get',
      title: 'Get timer details and DSL script',
      description: 'Retrieve a timer definition along with its rendered DSL script text.',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {
        id: z.string().describe('Timer identifier (e.g. "sunday-service")'),
      },
      run: async (args, ctx) => requireClient(ctx, 'pitimer').getTimer(args.id),
    }),

    defineTool({
      name: 'timer_save_script',
      title: 'Save or update timer via DSL script',
      description: 'Apply or update a timer definition using copy-pasteable DSL text block format (@timer, @schedule, @warning, @on-start, @on-end, @on-failure).',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: false,
      input: {
        scriptText: z.string().describe('Full DSL text block content defining the timer'),
      },
      run: async (args, ctx) => requireClient(ctx, 'pitimer').saveTimer({ scriptText: args.scriptText }),
    }),

    defineTool({
      name: 'timer_delete',
      title: 'Delete a timer',
      description: 'Permanently remove a timer definition.',
      permission: admin,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {
        id: z.string().describe('Timer identifier to remove'),
      },
      run: async (args, ctx) => requireClient(ctx, 'pitimer').deleteTimer(args.id),
    }),

    defineTool({
      name: 'timer_run_phase',
      title: 'Manually run a timer phase',
      description: 'Immediately trigger execution of a timer phase (such as "start", "end", or "warning") without waiting for the scheduled wall-clock time.',
      permission: write,
      upstream: 'pitimer',
      effect: 'live',
      idempotent: false,
      input: {
        id: z.string().describe('Timer identifier'),
        phase: z.enum(['start', 'end', 'warning', 'manual']).optional().describe('Phase to execute (default: "start")'),
      },
      run: async (args, ctx) => requireClient(ctx, 'pitimer').runPhase(args.id, args.phase),
    }),

    defineTool({
      name: 'timer_cancel_run',
      title: 'Cancel an active timer run',
      description: 'Abort an ongoing step execution sequence for a timer.',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {
        runId: z.string().describe('Active run identifier to cancel'),
      },
      run: async (args, ctx) => requireClient(ctx, 'pitimer').cancelRun(args.runId),
    }),

    defineTool({
      name: 'timer_runs',
      title: 'List timer execution history',
      description: 'View logs of recent timer runs, step execution statuses, durations, and outputs.',
      permission: write,
      upstream: 'pitimer',
      effect: 'change',
      idempotent: true,
      input: {},
      run: async (_args, ctx) => requireClient(ctx, 'pitimer').listRuns(),
    }),
  ],
};
