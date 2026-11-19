#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { init } from '../lib/init.js';
import { dispatch } from '../lib/dispatcher.js';
import { StateStore } from '../lib/state.js';
import { doctor } from '../lib/doctor.js';
import { listModels } from '../lib/models.js';

const USAGE = 'rsc-vibe init | models | dispatch --task ID --tier heavy|balanced|light|debug [--model ID] --prompt TEXT [--worktree feat/name] [--max-turns 1..20] | status | doctor';
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    task: { type: 'string' }, tier: { type: 'string' }, model: { type: 'string' }, prompt: { type: 'string' },
    worktree: { type: 'string' }, 'max-turns': { type: 'string' }, help: { type: 'boolean', short: 'h' }
  } });
  const command = positionals[0];
  if (values.help || !command) console.log(USAGE);
  else {
    if (positionals.length !== 1) throw new Error('Unexpected positional arguments');
    const dispatchOnly = ['task', 'tier', 'model', 'prompt', 'worktree', 'max-turns'];
    if (command !== 'dispatch' && dispatchOnly.some(key => Object.hasOwn(values, key))) throw new Error('Task flags apply only to dispatch');
    let result;
    if (command === 'init') result = await init(process.cwd());
    else if (command === 'models') result = await listModels();
    else if (command === 'dispatch') result = await dispatch({ ...values, cwd: process.cwd(), maxTurns: values['max-turns'] === undefined ? 8 : Number(values['max-turns']) });
    else if (command === 'status') {
      const state = await new StateStore().snapshot();
      result = { concurrency: `${state.active.length}/2`, active: state.active.map(row => ({
        ...row, note: row.childPid ? 'Tracked child; conservative PID liveness' : 'Reserved/ambiguous: retained until reconciled'
      })), recent: state.history.slice(-10) };
    } else if (command === 'doctor') result = await doctor();
    else throw new Error(`Unknown command: ${command}. ${USAGE}`);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'BLOCKED' || result.status === 'NEEDS_CONTEXT') process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'BLOCKED', reason: error.message })); process.exitCode = 1;
}
