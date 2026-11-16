import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { temp, root, HELP, fakeExec, fakeSpawn } from '../scripts/helpers.js';
import { StateStore } from '../lib/state.js';

test('state enforces limit, duplicate task and conservative orphan recovery', async t => {
  const state = new StateStore(await temp(t));
  const a = await state.reserve({ task: 'a', project: 'x' });
  await assert.rejects(state.reserve({ task: 'a', project: 'x' }), /already/);
  const b = await state.reserve({ task: 'b', project: 'x' });
  await assert.rejects(state.reserve({ task: 'c', project: 'y' }), /2/);
  await state.finish(a.id, { status: 'DONE' });
  const c = await state.reserve({ task: 'c', project: 'y' });
  assert.equal((await state.snapshot()).active.length, 2);
  await state.finish(b.id, { status: 'BLOCKED' }); await state.finish(c.id, { status: 'DONE' });
  assert.equal((await state.snapshot()).active.length, 0);
});


test('cross-process admission never grants more than two slots', async t => {
  const dir = await temp(t);
  const workers = Array.from({ length: 8 }, (_, i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/slot-worker.js', dir, String(i)], { shell: false, windowsHide: true });
    let output = ''; child.stdout.on('data', b => { output += b; }); child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(output)));
  }));
  const results = await Promise.all(workers);
  assert.equal(results.filter(r => r.accepted).length, 2);
  assert.equal((await new StateStore(dir).snapshot()).active.length, 2);
});


test('malformed state and abandoned lock fail closed', async t => {
  const dir = await temp(t);
  await fs.writeFile(path.join(dir, 'state.json'), '{bad');
  const state = new StateStore(dir, { lockTimeout: 80 });
  await assert.rejects(state.reserve({ task: 'a' }), /state|JSON/i);
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ version: 1, active: [{ id: 'bad', ownerPid: -1, childPid: -1 }], history: [] }));
  await assert.rejects(state.snapshot(), /Invalid bridge state/);
  await fs.rm(path.join(dir, 'state.json'));
  await fs.mkdir(path.join(dir, 'state.lock'));
  await assert.rejects(state.snapshot(), /lock/i);
});


test('orphan slot survives live child and is recovered only after both processes die', async t => {
  const state = new StateStore(await temp(t));
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { windowsHide: true, stdio: 'ignore' });
  const exited = new Promise(resolve => child.once('close', resolve));
  t.after(() => { child.kill(); });
  const row = await state.reserve({ task: 'orphan', project: 'x' });
  await state.update(row.id, { ownerPid: 2147483647, childPid: child.pid });
  assert.equal((await state.snapshot()).active.length, 1);
  child.kill(); await exited;
  const snapshot = await state.snapshot();
  assert.equal(snapshot.active.length, 0); assert.equal(snapshot.history[0].status, 'BLOCKED');
  const ambiguous = await state.reserve({ task: 'ambiguous', project: 'x' });
  await state.update(ambiguous.id, { ownerPid: 2147483647, childPid: null });
  assert.equal((await state.snapshot()).active.length, 1);
});

