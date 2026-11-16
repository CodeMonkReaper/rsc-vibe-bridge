import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exec as nativeExec } from './process.js';
import { safeParents } from './init.js';

function treePath(cwd, branch) {
  return path.join(cwd, '.worktrees', createHash('sha256').update(branch).digest('hex').slice(0, 20));
}
export async function assertDispatchBranch(cwd, { exec = nativeExec } = {}) {
  const branch = (await exec('git', ['-C', cwd, 'symbolic-ref', '--short', 'HEAD'])).stdout.trim();
  let defaultBranch;
  try { defaultBranch = (await exec('git', ['-C', cwd, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).stdout.trim().replace(/^origin\//, ''); }
  catch (e) { if (e.code !== 1 && e.code !== 128) throw e; }
  if (['main', 'master', defaultBranch].filter(Boolean).some(name => name.toLowerCase() === branch.toLowerCase())) throw new Error('Protected default branch: dispatch on a feature branch or request --worktree');
  if (!branch || branch.includes('\n')) throw new Error('A named feature branch is required');
  return branch;
}
export async function createWorktree(cwd, branch, { exec = nativeExec } = {}) {
  const git = args => exec('git', ['-C', cwd, ...args]);
  if (typeof branch !== 'string' || !/^(feat|fix|chore|test)\/[a-z0-9][a-z0-9._/-]*$/i.test(branch) || branch.includes('..')) {
    throw new Error('Protected/invalid branch: use feat/, fix/, chore/ or test/; main is protected');
  }
  await git(['check-ref-format', '--branch', branch]);
  const root = (await git(['rev-parse', '--show-toplevel'])).stdout.trim();
  if (path.resolve(root).toLowerCase() !== path.resolve(cwd).toLowerCase()) throw new Error('Worktree requires repository root');
  if ((await git(['status', '--porcelain'])).stdout.trim()) throw new Error('Uncommitted/dirty project: commit changes before creating worktree');
  const target = treePath(cwd, branch);
  await safeParents(cwd, path.relative(cwd, path.join(target, 'placeholder')));
  // safeParents created target; Git requires a new/empty directory, which is checked by Git.
  const base = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  await git(['worktree', 'add', '-b', branch, target, base]);
  return { branch, path: target, base };
}

export async function cleanupWorktree(cwd, tree, { exec = nativeExec } = {}) {
  if (!tree || path.resolve(tree.path) !== path.resolve(treePath(cwd, tree.branch))) throw new Error('Worktree outside bridge-owned path');
  const stat = await fs.lstat(tree.path);
  if (stat.isSymbolicLink()) throw new Error('Unsafe worktree link');
  const parent = await fs.lstat(path.join(cwd, '.worktrees'));
  if (parent.isSymbolicLink()) throw new Error('Unsafe worktree parent link');
  const git = args => exec('git', ['-C', cwd, ...args]);
  const listing = (await git(['worktree', 'list', '--porcelain'])).stdout;
  const entry = listing.split(/\r?\n\r?\n/).find(block => block.includes(`branch refs/heads/${tree.branch}`));
  if (!entry || !entry.split(/\r?\n/).some(line => line.startsWith('worktree ') && path.resolve(line.slice(9)).toLowerCase() === path.resolve(tree.path).toLowerCase())) throw new Error('Worktree registration mismatch');
  if ((await exec('git', ['-C', tree.path, 'status', '--porcelain'])).stdout.trim()) throw new Error('Dirty worktree: preserve uncommitted work');
  await git(['merge-base', '--is-ancestor', tree.branch, 'HEAD']);
  await git(['worktree', 'remove', tree.path]);
  // Keep the branch as an extra recovery reference; never force-delete branches.
}
