import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { temp, root, HELP, fakeExec, fakeSpawn } from '../scripts/helpers.js';
import { init } from '../lib/init.js';
import { MODELS, inspectVibe, buildArgs } from '../lib/router.js';

test('exact tier routing and help capability validation', async () => {
  assert.deepEqual(MODELS, { heavy: 'mistral-large-4', balanced: 'zai-glm-5-3-flash', light: 'mistral-small-2603', debug: 'zai-glm-5-3' });
  await assert.rejects(inspectVibe({ exec: async () => ({ stdout: '--prompt' }) }), /flags/);
  const capabilities = await inspectVibe({ exec: async (file, args) => {
    assert.equal(file, 'vibe'); assert.deepEqual(args, ['--help']); return { stdout: HELP };
  } });
  const args = buildArgs({ tier: 'heavy', prompt: 'hello & $(exit) " --model evil', cwd: 'C:\\space dir', outputDir: 'C:\\logs', maxTurns: 8 }, capabilities);
  assert.equal(args[args.indexOf('--model') + 1], MODELS.heavy);
  assert.equal(args[args.indexOf('--prompt') + 1], 'hello & $(exit) " --model evil');
  assert.throws(() => buildArgs({ tier: 'unknown', maxTurns: 8 }, capabilities), /tier/);
  for (const maxTurns of [0, 21, NaN, 1.5]) assert.throws(() => buildArgs({ tier: 'light', maxTurns }, capabilities), /turn/);
});


test('init is idempotent and preserves original governance and config', async t => {
  const dir = await root(t);
  const first = await init(dir);
  assert.equal(first.catalogVersion, '4.1.7');
  assert.ok(first.created.includes('.vibe/config.toml'));
  const config = path.join(dir, '.vibe/config.toml');
  await fs.writeFile(config, '# custom');
  const second = await init(dir);
  assert.equal(await fs.readFile(config, 'utf8'), '# custom');
  assert.ok(second.skipped.includes('.vibe/config.toml'));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, '.rsc.json'))), { catalogVersion: '4.1.7' });
  for (const role of ['architect', 'developer', 'debugger', 'reviewer', 'tester']) {
    const agent = await fs.readFile(path.join(dir, `.vibe/agents/${role}.toml`), 'utf8');
    assert.match(agent, /AGENTS.md/); assert.match(agent, /skill-registry.json/);
  }
});


test('init rejects escaping symlink directories and missing governance', async t => {
  const dir = await temp(t), outside = await temp(t);
  await assert.rejects(init(dir), /rsc/);
  await fs.writeFile(path.join(dir, '.rsc.json'), '{"catalogVersion":"4"}');
  await fs.symlink(outside, path.join(dir, '.vibe'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(init(dir), /link|outside/i);
});

