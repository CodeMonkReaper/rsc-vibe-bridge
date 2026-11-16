import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { temp, root, HELP, fakeExec, fakeSpawn } from '../scripts/helpers.js';
import { StateStore } from '../lib/state.js';
import { init } from '../lib/init.js';
import { MODELS } from '../lib/router.js';
import { dispatch, classify, responseStatus } from '../lib/dispatcher.js';

test('response status accepts prose followed by final JSON without accepting stale examples', () => {
  const reply = text => [{ role: 'assistant', content: [{ type: 'text', text }] }];
  assert.equal(responseStatus(reply('Conectividad confirmada.\n\n```json\n{"status":"DONE","summary":"Sin herramientas"}\n```')), 'DONE');
  assert.equal(responseStatus(reply('Estado previo:\n```json\n{"status":"DONE"}\n```\nEstado final:\n```json\n{"status":"NEEDS_CONTEXT"}\n```')), 'NEEDS_CONTEXT');
  assert.equal(responseStatus(reply('Texto\r\n```JSON\r\n{"status":"BLOCKED"}\r\n```\r\n')), 'BLOCKED');
  assert.equal(responseStatus(reply('Texto\n```json\n{"status":"DONE"}\n```\nPero la tarea no terminó.')), null);
  assert.equal(responseStatus(reply('Texto\n```json\n{"status":"DONE"}\n```\n```json\n{bad}\n```')), null);
  assert.equal(responseStatus(reply('Texto\n```json\n{"status":"UNKNOWN"}\n```')), null);
  assert.equal(responseStatus(reply('Texto\n```javascript\n{"status":"DONE"}\n```')), null);
  assert.equal(responseStatus(null), null);
  assert.equal(responseStatus({ content: 'null' }), null);
});

test('dispatch preserves failures even when prose ends with valid success JSON', async t => {
  const dir = await root(t), stateDir = await temp(t); await init(dir);
  const output = JSON.stringify([{ role: 'assistant', content: [{ type: 'text', text: 'Respuesta.\n```json\n{"status":"DONE"}\n```' }] }]);
  for (const [code, expected] of [[0, 'DONE'], [1, 'BLOCKED'], [3, 'DONE_WITH_CONCERNS']]) {
    const result = await dispatch({ cwd: dir, task: `fenced-${code}`, tier: 'light', prompt: 'x' }, {
      state: new StateStore(stateDir), exec: fakeExec, spawn: fakeSpawn(code, output)
    });
    assert.equal(result.status, expected);
  }
});

test('dispatcher records model, output, terminal states and releases slots', async t => {
  const dir = await root(t), stateDir = await temp(t);
  await init(dir);
  const result = await dispatch({ cwd: dir, task: 'task-1', tier: 'balanced', prompt: 'Do work', maxTurns: 3 }, {
    state: new StateStore(stateDir), spawn: fakeSpawn(), exec: fakeExec
  });
  assert.equal(result.status, 'DONE'); assert.equal(result.requestedModel, MODELS.balanced);
  assert.equal(result.effectiveModel, null);
  assert.match(await fs.readFile(result.stdoutPath, 'utf8'), /DONE/);
  assert.equal((await new StateStore(stateDir).snapshot()).active.length, 0);
});


test('spawn errors and nonzero exit do not leak reservations', async t => {
  const dir = await root(t), stateDir = await temp(t); await init(dir);
  const state = new StateStore(stateDir);
  const result = await dispatch({ cwd: dir, task: 'fail', tier: 'light', prompt: 'x' }, {
    state, exec: fakeExec, spawn: () => { throw new Error('ENOENT'); }
  });
  assert.equal(result.status, 'BLOCKED'); assert.equal((await state.snapshot()).active.length, 0);
  const limited = await dispatch({ cwd: dir, task: 'limit', tier: 'light', prompt: 'x' }, {
    state, exec: fakeExec, spawn: fakeSpawn(3, '')
  });
  assert.equal(limited.status, 'DONE_WITH_CONCERNS');
});


test('classification uses exit evidence before self-reported success', () => {
  assert.equal(classify(1, { status: 'DONE' }), 'BLOCKED');
  assert.equal(classify(3, {}), 'DONE_WITH_CONCERNS');
  assert.equal(classify(0, { status: 'NEEDS_CONTEXT' }), 'NEEDS_CONTEXT');
  assert.equal(classify(0, { stop_reason: 'turn_limit' }), 'DONE_WITH_CONCERNS');
  assert.equal(classify(3, { outcome: 'refusal' }), 'BLOCKED');
  assert.equal(classify(3, { stop_reason: 'refusal' }), 'BLOCKED');
  assert.equal(responseStatus({ messages: [{ role: 'assistant', content: '```json\n{"status":"NEEDS_CONTEXT"}\n```' }] }), 'NEEDS_CONTEXT');
});


test('model evidence uses exported presets and never masks failures or missing context', async t => {
  const dir = await root(t), stateDir = await temp(t); await init(dir);
  for (const [code, status, expected] of [[1, 'DONE', 'BLOCKED'], [0, 'NEEDS_CONTEXT', 'NEEDS_CONTEXT'], [0, 'DONE', 'DONE_WITH_CONCERNS']]) {
    const result = await dispatch({ cwd: dir, task: `export-${code}-${status}`, tier: 'light', prompt: 'x' }, {
      state: new StateStore(stateDir), exec: fakeExec,
      spawn: fakeSpawn(code, JSON.stringify({ status }), { outcome: code ? 'infrastructure_failure' : 'finished', config: { active_model: 'alias', models: { alias: { name: 'unexpected-model' } } } })
    });
    assert.equal(result.status, expected); assert.equal(result.effectiveModel, 'unexpected-model');
    assert.equal(result.modelMismatch, true);
    const persisted = JSON.parse(await fs.readFile(path.join(path.dirname(result.stdoutPath), 'result.json'), 'utf8'));
    assert.equal(persisted.status, expected);
  }
});


test('dispatch refuses a modified or missing selected profile and protected branch before spawn', async t => {
  const dir = await root(t); await init(dir);
  const options = { cwd: dir, task: 'policy', tier: 'balanced', prompt: 'x' };
  const dependencies = { state: new StateStore(await temp(t)), exec: fakeExec, spawn: () => assert.fail('must not spawn') };
  await fs.writeFile(path.join(dir, '.vibe/agents/developer.toml'), '[tools.write_file]\npermission="always"');
  await assert.rejects(dispatch(options, dependencies), /safety policy/);
  await fs.rm(path.join(dir, '.vibe/agents/developer.toml')); await init(dir);
  await fs.rm(path.join(dir, '.vibe/agents/architect.toml'));
  await assert.rejects(dispatch({ ...options, tier: 'heavy' }, dependencies), /ENOENT/);
  await assert.rejects(dispatch(options, { ...dependencies, exec: async command => ({ stdout: command === 'git' ? 'main' : HELP }) }), /Protected/);
});


test('final record survives history rollover beyond 100 runs', async t => {
  const dir = await root(t), stateDir = await temp(t); await init(dir);
  const state = new StateStore(stateDir);
  const first = await dispatch({ cwd: dir, task: 'durable', tier: 'light', prompt: 'x' }, { state, exec: fakeExec, spawn: fakeSpawn() });
  for (let i = 0; i < 101; i++) {
    const row = await state.reserve({ task: `history-${i}`, project: dir });
    await state.finish(row.id, { status: 'DONE' });
  }
  assert.equal((await state.snapshot()).history.length, 100);
  const artifact = JSON.parse(await fs.readFile(path.join(path.dirname(first.stdoutPath), 'result.json'), 'utf8'));
  assert.equal(artifact.status, 'DONE'); assert.equal(artifact.requestedModel, MODELS.light);
});
