import test from 'node:test';
import assert from 'node:assert/strict';
import { temp, root, HELP, fakeExec, fakeSpawn } from '../scripts/helpers.js';
import { init } from '../lib/init.js';
import { StateStore } from '../lib/state.js';
import { listModels } from '../lib/models.js';
import { buildArgs, resolveModel, inspectVibe } from '../lib/router.js';
import { dispatch } from '../lib/dispatcher.js';

test('listModels requires MISTRAL_API_KEY and never leaks it on error or success', async () => {
  const missing = await listModels({ env: {} });
  assert.equal(missing.status, 'BLOCKED');
  assert.match(missing.reason, /MISTRAL_API_KEY/);

  const secret = 'sk-test-super-secret-value-12345';
  let seenAuth = null;
  let seenUrl = null;
  const ok = await listModels({
    env: { MISTRAL_API_KEY: secret },
    baseUrl: 'https://api.mistral.ai/v1/',
    fetchImpl: async (url, init) => {
      seenUrl = url;
      seenAuth = init.headers.Authorization;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'mistral-small-2603', owned_by: 'mistralai', max_context_length: 128000 },
            { id: 'devstral-medium-2507', owned_by: 'mistralai', max_context_length: 256000 },
            { id: 'mistral-small-2603', owned_by: 'mistralai', max_context_length: 128000 }
          ]
        })
      };
    }
  });
  assert.equal(seenUrl, 'https://api.mistral.ai/v1/models');
  assert.equal(seenAuth, `Bearer ${secret}`);
  assert.equal(ok.status, 'DONE');
  assert.equal(ok.count, 2);
  assert.deepEqual(ok.models.map(m => m.id), ['devstral-medium-2507', 'mistral-small-2603']);
  assert.ok(!JSON.stringify(ok).includes(secret));

  const denied = await listModels({
    env: { MISTRAL_API_KEY: secret },
    fetchImpl: async () => ({ ok: false, status: 401 })
  });
  assert.equal(denied.status, 'BLOCKED');
  assert.match(denied.reason, /HTTP 401/);
  assert.ok(!JSON.stringify(denied).includes(secret));

  const failed = await listModels({
    env: { MISTRAL_API_KEY: secret },
    fetchImpl: async () => { throw new Error(`connection refused with ${secret}`); }
  });
  assert.equal(failed.status, 'BLOCKED');
  assert.ok(!JSON.stringify(failed).includes(secret));
});

test('dispatch --model override keeps tier role and tracks requestedModel', async t => {
  const capabilities = await inspectVibe({ exec: async () => ({ stdout: HELP }) });
  assert.equal(resolveModel({ tier: 'balanced', model: 'devstral-medium-2507' }), 'devstral-medium-2507');
  assert.throws(() => resolveModel({ tier: 'balanced', model: 'bad model; rm -rf' }), /Invalid model/);

  const args = buildArgs({
    tier: 'balanced',
    model: 'devstral-medium-2507',
    prompt: 'implement T004',
    cwd: 'C:\\repo',
    outputDir: 'C:\\logs',
    maxTurns: 6
  }, capabilities);
  assert.equal(args[args.indexOf('--model') + 1], 'devstral-medium-2507');
  assert.equal(args[args.indexOf('--agent') + 1], 'developer');

  const dir = await root(t);
  await init(dir);
  const state = new StateStore(await temp(t));
  let spawnedArgs = null;
  const innerSpawn = fakeSpawn(0, JSON.stringify([{ role: 'assistant', content: '{"status":"DONE","summary":"ok"}' }]), {
    effective_config: {
      active_model: 'devstral-medium-2507',
      models: [{ alias: 'devstral-medium-2507', name: 'devstral-medium-2507' }]
    }
  });
  const result = await dispatch({
    task: 'custom-model-task',
    tier: 'balanced',
    model: 'devstral-medium-2507',
    prompt: 'do work',
    cwd: dir,
    maxTurns: 4
  }, {
    state,
    exec: fakeExec,
    spawn: (cmd, a, opts) => {
      spawnedArgs = a;
      return innerSpawn(cmd, a, opts);
    }
  });
  assert.equal(result.status, 'DONE');
  assert.equal(result.requestedModel, 'devstral-medium-2507');
  assert.equal(result.effectiveModel, 'devstral-medium-2507');
  assert.equal(spawnedArgs[spawnedArgs.indexOf('--model') + 1], 'devstral-medium-2507');
  assert.equal(spawnedArgs[spawnedArgs.indexOf('--agent') + 1], 'developer');
});
