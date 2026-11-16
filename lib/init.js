import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from './router.js';

const templateDir = fileURLToPath(new URL('../templates/', import.meta.url));
export async function validateAgent(cwd, role) {
  const file = path.join(cwd, '.vibe', 'agents', `${role}.toml`);
  const actualRoot = await fs.realpath(cwd);
  const actual = await fs.realpath(file);
  const rel = path.relative(actualRoot, actual);
  if (rel.startsWith('..') || path.isAbsolute(rel) || (await fs.lstat(file)).isSymbolicLink()) throw new Error('Unsafe agent path');
  const expected = await fs.readFile(path.join(templateDir, 'agents', `${role}.toml`), 'utf8');
  const found = await fs.readFile(file, 'utf8');
  if (found.replaceAll('\r\n', '\n') !== expected.replaceAll('\r\n', '\n')) {
    throw new Error(`Agent ${role} differs from bridge safety policy. Preserve/back up your file and install the supplied template before dispatch.`);
  }
  const configPath = path.join(cwd, '.vibe', 'config.toml');
  const realConfig = await fs.realpath(configPath);
  const configRelative = path.relative(actualRoot, realConfig);
  if (configRelative.startsWith('..') || path.isAbsolute(configRelative) || (await fs.lstat(configPath)).isSymbolicLink()) throw new Error('Unsafe config path');
  const expectedConfig = await fs.readFile(path.join(templateDir, 'config.toml'));
  const foundConfig = await fs.readFile(configPath);
  if (!foundConfig.equals(expectedConfig)) throw new Error('Project config differs from bridge safety policy. Back it up and use the supplied template before dispatch.');
}
export async function readGovernance(cwd) {
  const value = JSON.parse(await fs.readFile(path.join(cwd, '.rsc.json'), 'utf8'));
  if (typeof value.catalogVersion !== 'string' || !value.catalogVersion.trim()) throw new Error('.rsc.json has no catalogVersion');
  return value;
}

// Reject junction/symlink ancestors: exclusive creation alone does not stop path escape.
export async function safeParents(root, relative) {
  const absolute = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path outside project');
  let current = path.resolve(root);
  for (const piece of rel.split(path.sep).slice(0, -1)) {
    current = path.join(current, piece);
    try { await fs.mkdir(current); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const info = await fs.lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Unsafe link or directory: ${current}`);
  }
  return absolute;
}

export async function init(cwd) {
  const governance = await readGovernance(cwd);
  const result = { catalogVersion: governance.catalogVersion, created: [], skipped: [] };
  const files = new Map([
    ['.vibe/config.toml', await fs.readFile(path.join(templateDir, 'config.toml'), 'utf8')],
    ['01-TOOLS/vibe-bridge/models.json', `${JSON.stringify(MODELS, null, 2)}\n`],
    ['01-TOOLS/vibe-bridge/README.md', '# Vibe bridge\n\nUse rsc-vibe doctor, status and dispatch.\nModels: models.json. No credentials are stored here.\nRSC catalog at initialization: ' + governance.catalogVersion + '\n'],
    ['01-TOOLS/vibe-bridge/.gitignore', 'runs/\n']
  ]);
  for (const role of ['architect', 'developer', 'debugger', 'reviewer', 'tester']) {
    files.set(`.vibe/agents/${role}.toml`, await fs.readFile(path.join(templateDir, 'agents', `${role}.toml`), 'utf8'));
  }
  for (const [relative, content] of files) {
    const destination = await safeParents(cwd, relative);
    try { await fs.writeFile(destination, content, { flag: 'wx', mode: 0o600 }); result.created.push(relative); }
    catch (e) { if (e.code !== 'EEXIST') throw e; result.skipped.push(relative); }
  }
  return result;
}
