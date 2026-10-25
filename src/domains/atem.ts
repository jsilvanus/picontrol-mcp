import { z } from 'zod';
import { defineTool, requireClient, type DomainModule } from '../mcp/registry.js';
import { json } from './util.js';

const read = { domain: 'atem', level: 'read' } as const;
const write = { domain: 'atem', level: 'write' } as const;

export const atem: DomainModule = {
  resources: [
    {
      name: 'atem', uri: 'pi://atem', title: 'ATEM switcher',
      description: 'ATEM state: connection, program and preview inputs. Program is what is on air.',
      permission: read, upstream: 'pimatrix',
      read: async ctx => json(await requireClient(ctx, 'pimatrix').atem.getAtemState()),
    },
  ],
  tools: [
    defineTool({
      name: 'atem_switch', title: 'Switch the ATEM',
      description: 'Operate the ATEM: "preview" puts an input on preview (safe, not on air), "program" puts an input straight on air, "cut" swaps preview and program. ' +
        'Normal sequence: preview the input, check pi://atem, then cut. "preview" and "program" need "input" (ATEM input number); "cut" takes none.',
      permission: write, upstream: 'pimatrix', effect: 'live',
      input: { action: z.enum(['preview', 'program', 'cut']), input: z.number().int().min(0).optional().describe('ATEM input number (not needed for cut).') },
      run: async ({ action, input }, ctx) => {
        const atem = requireClient(ctx, 'pimatrix').atem;
        if (action === 'cut') return atem.cutAtem();
        if (input === undefined) throw new Error(`"input" is required for action "${action}".`);
        return action === 'preview' ? atem.setAtemPreview({ input }) : atem.setAtemProgram({ input });
      },
    }),
  ],
};
