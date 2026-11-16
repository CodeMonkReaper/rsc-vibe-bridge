import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn as nativeSpawn } from 'node:child_process';
import { finished } from 'node:stream/promises';
import { StateStore, alive } from './state.js';
import { inspectVibe, buildArgs, ROLES } from './router.js';
import { readGovernance, init, validateAgent } from './init.js';
import { createWorktree, assertDispatchBranch } from './worktree.js';

const STATES = ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'];
export function classify(code, data = {}) {
  const stop = data.stop_reason || data.stopReason;
  if (stop === 'refusal' || data.outcome === 'refusal') return 'BLOCKED';
  if (code === 3) return 'DONE_WITH_CONCERNS';
  if (code !== 0) return 'BLOCKED';
  if (['turn_limit', 'token_limit', 'price_limit', 'deadline', 'terminated', 'length', 'limit', 'interrupted'].includes(stop) ||
      ['turn_limit', 'token_limit', 'price_limit', 'deadline', 'terminated', 'length'].includes(data.outcome)) return 'DONE_WITH_CONCERNS';
  if (stop === 'refusal') return 'BLOCKED';
  if (STATES.includes(data.status)) return data.status;
  if (STATES.includes(data.outcome?.status)) return data.outcome.status;
  return 'DONE';
}
function jsonOrEmpty(text) { try { return JSON.parse(text); } catch { return {}; } }
export function responseStatus(data) {
  if (STATES.includes(data.status)) return data.status;
  const messages = Array.isArray(data) ? data : data.messages;
  const last = Array.isArray(messages) ? messages.filter(message => message.role === 'assistant').at(-1) : null;
  const content = last?.content ?? data.content ?? data.response;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map(block => block.text || '').join('') : '';
  const parsed = jsonOrEmpty(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  return STATES.includes(parsed.status) ? parsed.status : null;
}
async function readSmallJson(file) {
  try {
    if ((await fs.stat(file)).size > 2 * 1024 * 1024) return {};
    return jsonOrEmpty(await fs.readFile(file, 'utf8'));
  } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
function effectiveModel(data) {
  const config = data.effective_config || data.config;
  const active = config?.active_model;
  if (!active || typeof active !== 'string') return null;
  const preset = Array.isArray(config.models) ? config.models.find(model => model.alias === active || model.name === active) : config.models?.[active];
  return typeof preset?.name === 'string' ? preset.name : null;
}

export async function dispatch(options, dependencies = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const state = dependencies.state || new StateStore();
  const spawn = dependencies.spawn || nativeSpawn;
  if (typeof options.task !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(options.task)) throw new Error('task must be 1..80 letters, digits, dots, underscores or hyphens');
  await readGovernance(cwd);
  if (!Object.hasOwn(ROLES, options.tier)) throw new Error('Unknown tier');
  await validateAgent(cwd, ROLES[options.tier]);
  if (!options.worktree) await assertDispatchBranch(cwd, { exec: dependencies.exec });
  const models = JSON.parse(await fs.readFile(path.join(cwd, '01-TOOLS', 'vibe-bridge', 'models.json'), 'utf8'));
  const flags = await inspectVibe({ exec: dependencies.exec });
  // Validate before creating reservations, worktrees or log files.
  buildArgs({ ...options, cwd, outputDir: cwd, models }, flags);
  const startTime = Date.now();
  const record = await state.reserve({ task: options.task, project: cwd, tier: options.tier,
    requestedModel: models[options.tier], effectiveModel: null });
  const runDir = path.join(state.dir, 'runs', record.id);
  let child, completion, timer, outputDone = [], signalHandler;
  let stdout = '', stderr = '', launchError;
  let result = { status: 'BLOCKED', requestedModel: models[options.tier], effectiveModel: null };
  try {
    await fs.mkdir(runDir, { recursive: true, mode: 0o700 });
    let workingDirectory = cwd;
    if (options.worktree) {
      const tree = await createWorktree(cwd, options.worktree, { exec: dependencies.exec });
      workingDirectory = tree.path;
      await state.update(record.id, { worktree: tree });
      await init(workingDirectory);
      await validateAgent(workingDirectory, ROLES[options.tier]);
    }
    result.stdoutPath = path.join(runDir, 'stdout.log'); result.stderrPath = path.join(runDir, 'stderr.log');
    const args = buildArgs({ ...options, cwd: workingDirectory, outputDir: runDir, models,
      prompt: `Follow AGENTS.md and RSC. Preserve .rsc/ and .rsc.json. Stay within the task. If the skill registry is absent, report it; do not create it. Do not delegate or launch Vibe. End with JSON {"status":"DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT","summary":"..."}.\n\n${options.prompt}` }, flags);
    // Keep argv out of state/logs: it contains the user's prompt.
    await state.start(record.id, () => {
      child = spawn('vibe', args, { cwd: workingDirectory, shell: false, windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'] });
      completion = new Promise(resolve => {
        child.on('error', error => { launchError = error; });
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      for (const [stream, file, capture] of [
        [child.stdout, result.stdoutPath, data => { if (stdout.length < 1024 * 1024) stdout += data; }],
        [child.stderr, result.stderrPath, data => { if (stderr.length < 16384) stderr += data; }]
      ]) {
        const log = createWriteStream(file, { flags: 'wx', mode: 0o600 });
        log.on('error', () => child.kill());
        stream.on('error', error => { log.destroy(error); child.kill(); });
        stream.on('data', capture); stream.pipe(log);
        // Attach rejection handling immediately, before the process can fail.
        outputDone.push(finished(log).then(() => null, error => error));
      }
      return child;
    });
    signalHandler = () => { result.interrupted = true; child.kill(); };
    process.once('SIGINT', signalHandler); process.once('SIGTERM', signalHandler);
    timer = setTimeout(signalHandler, 930000); timer.unref();
    const exit = await completion;
    const streamErrors = (await Promise.all(outputDone)).filter(Boolean);
    const exported = await readSmallJson(path.join(runDir, 'export.json'));
    const response = jsonOrEmpty(stdout);
    const reportedStatus = responseStatus(response);
    result = { ...result, exitCode: exit.code, signal: exit.signal,
      effectiveModel: effectiveModel(exported), status: classify(exit.code, { ...response, ...exported, ...(reportedStatus ? { status: reportedStatus } : {}) }),
      stopReason: exported.stop_reason || exported.stopReason || null };
    if (result.status === 'DONE' && !reportedStatus) {
      result.status = 'DONE_WITH_CONCERNS';
      result.reason = 'Vibe finished without a recognized structured task status';
    }
    if (launchError || streamErrors.length || result.interrupted) {
      result.status = 'BLOCKED'; result.reason = launchError?.message || streamErrors[0]?.message || 'Interrupted';
    }
    if (result.effectiveModel && result.effectiveModel !== models[options.tier]) {
      if (result.status === 'DONE') result.status = 'DONE_WITH_CONCERNS';
      result.modelMismatch = true;
      result.reason ||= 'Vibe reported a different effective model';
    }
  } catch (error) {
    result.status = 'BLOCKED'; result.reason = error.message;
    if (child && alive(child.pid)) child.kill();
    if (completion) await completion;
    await Promise.all(outputDone);
  } finally {
    if (timer) clearTimeout(timer);
    if (signalHandler) { process.removeListener('SIGINT', signalHandler); process.removeListener('SIGTERM', signalHandler); }
  }
  result.durationMs = Date.now() - startTime;
  const tracked = (await state.snapshot()).active.find(row => row.id === record.id) || record;
  const finalRecord = { ...tracked, ...result, endedAt: new Date().toISOString() };
  // Keep a full per-run record even after the bounded status history rolls over.
  await fs.mkdir(runDir, { recursive: true, mode: 0o700 });
  const resultTemp = path.join(runDir, 'result.json.tmp');
  await fs.writeFile(resultTemp, `${JSON.stringify(finalRecord, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await fs.rename(resultTemp, path.join(runDir, 'result.json'));
  return state.finish(record.id, result);
}
