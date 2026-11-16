import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const dir of ['bin', 'lib', 'scripts', 'test']) {
  for (const file of readdirSync(dir).filter(x => x.endsWith('.js'))) {
    execFileSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit', windowsHide: true });
  }
}
console.log('Syntax checks passed');
