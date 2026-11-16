import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
export const HELP = '--prompt --output --max-turns --model --workdir --output-dir --agent --enabled-tools --disabled-tools --trust';
export async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rsc-vibe-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
export async function root(t) {
  const dir = await temp(t);
  await fs.writeFile(path.join(dir, '.rsc.json'), JSON.stringify({ catalogVersion: '4.1.7' }));
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '# Rules');
  return dir;
}
export const fakeExec = async (command, args) => ({ stdout: command === 'git' ? (args.includes('refs/remotes/origin/HEAD') ? 'origin/main' : 'feat/test') : HELP });
export function fakeSpawn(code = 0, output = '{"status":"DONE"}', exported) {
  return (command, args, options) => {
    assert.equal(command, 'vibe'); assert.equal(options.shell, false);
    const child = new EventEmitter();
    child.pid = process.pid;
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => true;
    setImmediate(async () => {
      if (exported) await fs.writeFile(path.join(args[args.indexOf('--output-dir') + 1], 'export.json'), JSON.stringify(exported));
      child.stdout.end(output); child.stderr.end(); child.emit('close', code, null);
    });
    return child;
  };
}

