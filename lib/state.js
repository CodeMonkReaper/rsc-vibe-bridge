import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export function defaultStateDir() {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'RscVibeBridge');
}
export function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export class StateStore {
  constructor(dir = defaultStateDir(), { lockTimeout = 5000 } = {}) {
    this.dir = dir; this.file = path.join(dir, 'state.json');
    this.lock = path.join(dir, 'state.lock'); this.lockTimeout = lockTimeout;
  }
  async transaction(action) {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + this.lockTimeout;
    for (;;) {
      try { await fs.mkdir(this.lock); break; }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        if (Date.now() >= deadline) throw new Error(`State lock busy: ${this.lock}. Inspect owner and running Vibe processes before manual recovery.`);
        await pause(20 + Math.floor(Math.random() * 30));
      }
    }
    let temporary;
    try {
      await fs.writeFile(path.join(this.lock, 'owner.json'), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' });
      let state;
      try { state = JSON.parse(await fs.readFile(this.file, 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; state = { version: 1, active: [], history: [] }; }
      if (state.version !== 1 || !Array.isArray(state.active) || !Array.isArray(state.history) ||
          state.active.length > 2 || new Set(state.active.map(row => row?.id)).size !== state.active.length ||
          state.active.some(row => !row || typeof row.id !== 'string' || !row.id || !Number.isInteger(row.ownerPid) || row.ownerPid < 1 ||
            (row.childPid !== null && (!Number.isInteger(row.childPid) || row.childPid < 1)))) {
        throw new Error('Invalid bridge state; refusing admission');
      }
      // A parent may die between spawn and saving childPid: null is never proof of death.
      const dead = state.active.filter(row => row.childPid && !alive(row.ownerPid) && !alive(row.childPid));
      state.active = state.active.filter(row => !dead.includes(row));
      state.history.push(...dead.map(row => ({ ...row, status: 'BLOCKED', endedAt: new Date().toISOString(), reason: 'Owner and child exited without final record' })));
      const result = await action(state);
      state.history = state.history.slice(-100);
      temporary = `${this.file}.${randomUUID()}.tmp`;
      const handle = await fs.open(temporary, 'wx', 0o600);
      try { await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`); await handle.sync(); }
      finally { await handle.close(); }
      await fs.rename(temporary, this.file);
      return result;
    } finally {
      if (temporary) await fs.unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; });
      await fs.unlink(path.join(this.lock, 'owner.json')).catch(e => { if (e.code !== 'ENOENT') throw e; });
      await fs.rmdir(this.lock);
    }
  }
  reserve(details) {
    return this.transaction(state => {
      if (state.active.some(row => row.task === details.task && row.project === details.project)) throw new Error('Task already active');
      if (state.active.length >= 2) throw new Error('Concurrency limit reached (2/2)');
      const record = { ...details, id: randomUUID(), ownerPid: process.pid, childPid: null,
        startedAt: new Date().toISOString(), phase: 'RESERVED' };
      state.active.push(record); return { ...record };
    });
  }
  update(id, data) {
    return this.transaction(state => {
      const row = state.active.find(item => item.id === id);
      if (!row) throw new Error('Unknown active run');
      Object.assign(row, data); return { ...row };
    });
  }
  start(id, launch) {
    return this.transaction(async state => {
      const row = state.active.find(item => item.id === id);
      if (!row) throw new Error('Unknown active run');
      const child = launch();
      row.childPid = child.pid || null; row.phase = 'RUNNING';
      return child;
    });
  }
  finish(id, details) {
    return this.transaction(state => {
      const row = state.active.find(item => item.id === id);
      if (!row) throw new Error('Unknown active run');
      const result = { ...row, ...details, endedAt: new Date().toISOString() };
      state.active = state.active.filter(item => item.id !== id); state.history.push(result);
      return result;
    });
  }
  snapshot() { return this.transaction(state => structuredClone(state)); }
}
