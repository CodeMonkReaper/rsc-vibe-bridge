import { StateStore } from '../lib/state.js';
const state = new StateStore(process.argv[2]);
try {
  await state.reserve({ task: process.argv[3], project: 'race' });
  process.stdout.write(JSON.stringify({ accepted: true }));
} catch (error) {
  if (!/2/.test(error.message)) throw error;
  process.stdout.write(JSON.stringify({ accepted: false }));
}
