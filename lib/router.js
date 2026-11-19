import { exec as nativeExec } from './process.js';

export const MODELS = Object.freeze({ heavy: 'mistral-large-4', balanced: 'zai-glm-5-3-flash',
  light: 'mistral-small-2603', debug: 'zai-glm-5-3' });
const REQUIRED = ['--prompt', '--output', '--max-turns', '--model', '--workdir',
  '--output-dir', '--agent', '--enabled-tools', '--trust'];
export const ROLES = Object.freeze({ heavy: 'architect', balanced: 'developer', light: 'tester', debug: 'debugger' });

export async function inspectVibe({ exec = nativeExec } = {}) {
  const { stdout } = await exec('vibe', ['--help']);
  const flags = new Set(stdout.match(/--[a-z][a-z-]*/g) || []);
  const missing = REQUIRED.filter(flag => !flags.has(flag));
  if (missing.length) throw new Error(`Vibe missing required flags: ${missing.join(', ')}`);
  return flags;
}

export function resolveModel({ tier, model, models = MODELS }) {
  if (!Object.hasOwn(MODELS, tier)) throw new Error(`Unknown tier: ${tier}`);
  const selected = model !== undefined ? model : models[tier];
  if (typeof selected !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(selected)) throw new Error('Invalid model configuration');
  return selected;
}

export function buildArgs({ tier, model, prompt, cwd, outputDir, maxTurns = 8, models = MODELS }, flags) {
  const selectedModel = resolveModel({ tier, model, models });
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 20) throw new Error('max-turns must be an integer from 1 to 20');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.includes('\0')) throw new Error('A nonempty prompt is required');
  if (!flags || REQUIRED.some(flag => !flags.has(flag))) throw new Error('Vibe flags must be inspected before dispatch');
  const args = ['--prompt', prompt, '--model', selectedModel, '--max-turns', String(maxTurns),
    '--output', 'json', '--workdir', cwd, '--output-dir', outputDir, '--agent', ROLES[tier], '--trust'];
  // A fixed tool allow-list also prevents model-triggered subagents or new Vibe shells.
  for (const tool of ['read_file', 'grep', 'write_file', 'edit']) args.push('--enabled-tools', tool);
  if (flags.has('--time-limit')) args.push('--time-limit', '900');
  return args;
}
