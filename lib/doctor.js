import path from 'node:path';
import fs from 'node:fs/promises';
import { exec as nativeExec } from './process.js';
import { inspectVibe } from './router.js';
import { readGovernance } from './init.js';

export async function doctor(cwd = process.cwd(), { exec = nativeExec } = {}) {
  const checks = [];
  async function check(name, run) {
    try { checks.push({ name, ok: true, detail: await run() }); }
    catch (error) { checks.push({ name, ok: false, detail: error.message }); }
  }
  await check('Windows', async () => { if (process.platform !== 'win32') throw new Error('Native Windows is required'); return process.platform; });
  await check('node', async () => {
    if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('Node >=18 required');
    return (await exec(process.execPath, ['--version'])).stdout.trim();
  });
  for (const command of ['pwsh', 'git', 'vibe']) {
    await check(command, async () => (await exec(command, ['--version'])).stdout.trim());
  }
  await check('vibe flags', async () => [...await inspectVibe({ exec })].join(' '));
  await check('RSC', async () => `catalogVersion=${(await readGovernance(cwd)).catalogVersion}`);
  await check('Git repository', async () => (await exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel'])).stdout.trim());
  await check('bridge init', async () => {
    await fs.access(path.join(cwd, '.vibe', 'config.toml'));
    await fs.access(path.join(cwd, '01-TOOLS', 'vibe-bridge', 'models.json'));
    return 'local configuration present';
  });
  return { status: checks.every(row => row.ok) ? 'DONE_WITH_CONCERNS' : 'BLOCKED', checks,
    notes: ['Authentication and model entitlement not probed (no inference).',
      'RSC hooks for Codex are not installed into Vibe; profiles carry instructions, not an OS sandbox.'] };
}
