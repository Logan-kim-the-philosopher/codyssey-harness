import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { assignmentPaths, PROJECT_ROOT, loadState, saveState } from './storage.mjs';
import { renderHub } from './hub.mjs';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function configureGithub(code, owner, repo) {
  if (!owner || !repo) throw new Error('owner and repo are required.');
  const state = loadState(code);
  state.github = { owner, repo, pagesUrl: `https://${owner}.github.io/${repo}/`, remote: `git@github.com:${owner}/${repo}.git` };
  state.history.push({ event: 'github-configured', owner, repo, at: new Date().toISOString() });
  saveState(state);
  return state.github;
}

export function publishPreflight(code) {
  const state = loadState(code);
  const paths = assignmentPaths(code);
  if (!state.github?.owner || !state.github?.repo) throw new Error('GitHub repository is not configured.');
  for (const [file, label] of [[path.join(PROJECT_ROOT, 'submissions', code.toUpperCase(), 'README.md'), 'submission README'], [path.join(PROJECT_ROOT, 'docs', code.toUpperCase(), 'index.html'), 'Pages presentation']]) {
    if (!existsSync(file)) throw new Error(`${label} is missing: ${file}`);
  }
  const status = git(PROJECT_ROOT, ['status', '--short']);
  return { code, remote: state.github.remote, pagesUrl: state.github.pagesUrl, changedFiles: status ? status.split('\n') : [], ready: true, note: 'Preflight only; no push performed.' };
}

export function publish(code, message = `Submit ${code}`) {
  const state = loadState(code);
  renderHub();
  const result = publishPreflight(code);
  const remote = state.github.remote;
  try {
    const current = git(PROJECT_ROOT, ['remote', 'get-url', 'origin']);
    if (current !== remote) git(PROJECT_ROOT, ['remote', 'set-url', 'origin', remote]);
  } catch {
    git(PROJECT_ROOT, ['remote', 'add', 'origin', remote]);
  }
  const targets = ['README.md', `docs/${code.toUpperCase()}`, `submissions/${code.toUpperCase()}`];
  const trackedFiles = git(PROJECT_ROOT, ['ls-files']).split('\n');
  if (trackedFiles.includes('docs/index.html')) targets.splice(1, 0, 'docs/index.html');
  execFileSync('git', ['add', '--', ...targets], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  execFileSync('git', ['commit', '--only', '-m', message, '--', ...targets], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  execFileSync('git', ['push', 'origin', 'HEAD'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  state.publish = { status: 'pushed', at: new Date().toISOString(), remote, pagesUrl: state.github.pagesUrl };
  state.history.push({ event: 'published', at: state.publish.at, remote });
  saveState(state);
  return { ...result, pushed: true, pagesUrl: state.github.pagesUrl };
}
