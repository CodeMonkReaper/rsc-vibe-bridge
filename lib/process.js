import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export async function exec(command, args, options = {}) {
  return execute(command, args, { encoding: 'utf8', windowsHide: true,
    shell: false, timeout: 15000, maxBuffer: 2 * 1024 * 1024, ...options });
}
