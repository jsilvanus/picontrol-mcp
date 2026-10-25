import { z } from 'zod';
import type { ResourceBody } from '../mcp/registry.js';

/** The generated clients use string enums; the tools take the same string values from zod. */
export const cast = <T>(value: unknown): T => value as T;

export const json = (value: unknown): ResourceBody => ({ json: value });

export const cameraId = z.enum(['cam1', 'cam2', 'cam3']).describe('Camera: cam1, cam2 or cam3.');
export const sourceId = z.enum(['hama', 'rtmp1', 'rtmp2', 'cam1', 'cam2', 'cam3', 'PiPGM1', 'PiPGM2', 'PiPGM3'])
  .describe('Source id as listed in pi://routing/sources.');
export const outputId = z.enum(['hdmi0', 'hdmi1', 'multiview']).describe('Output id as listed in pi://routing/outputs.');
export const pipelineId = z.enum(['PiPGM1', 'PiPGM2', 'PiPGM3']).describe('Program pipeline as listed in pi://program/pipelines.');

/** Fails with a clear message when a tool call lacks a field its chosen action needs. */
export function need<T>(value: T | undefined, field: string, action: string): T {
  if (value === undefined) throw new Error(`"${field}" is required for action "${action}".`);
  return value;
}
