import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { temp, root, HELP, fakeExec, fakeSpawn } from '../scripts/helpers.js';
import { createWorktree, cleanupWorktree } from '../lib/worktree.js';

test('worktree refuses main and dirty root; preserves unmerged work', async t => {
  const dir = await temp(t);
  const git = args => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', windowsHide: true });
  git(['init', '-b', 'main']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.invalid']);
  await fs.writeFile(path.join(dir, '.gitignore'), '.worktrees/\n');
  git(['add', '.']); git(['commit', '-m', 'baseline']);
  await assert.rejects(createWorktree(dir, 'main'), /protect|main/i);
  await fs.writeFile(path.join(dir, 'dirty.txt'), 'x');
  await assert.rejects(createWorktree(dir, 'feat/a'), /dirty|uncommitted/i);
  await fs.rm(path.join(dir, 'dirty.txt'));
  const tree = await createWorktree(dir, 'feat/a');
  await fs.writeFile(path.join(tree.path, 'work.txt'), 'keep');
  await assert.rejects(cleanupWorktree(dir, tree), /dirty|uncommitted/i);
  assert.equal(await fs.readFile(path.join(tree.path, 'work.txt'), 'utf8'), 'keep');
  await fs.rm(path.join(tree.path, 'work.txt'));
  await fs.writeFile(path.join(tree.path, 'committed.txt'), 'unmerged');
  execFileSync('git', ['-C', tree.path, 'add', '.'], { windowsHide: true });
  execFileSync('git', ['-C', tree.path, 'commit', '-m', 'unmerged work'], { windowsHide: true });
  await assert.rejects(cleanupWorktree(dir, tree));
  git(['merge', '--ff-only', tree.branch]);
  await cleanupWorktree(dir, tree);
  await assert.rejects(fs.stat(tree.path), /ENOENT/);
});

