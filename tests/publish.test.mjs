import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(harnessRoot, 'scripts/codyssey-harness.mjs');

test('publish links directly from README to Pages and isolates its commit', (t) => {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'codyssey-harness-publish-'));
  const remote = path.join(projectRoot, '..', `${path.basename(projectRoot)}-remote.git`);
  t.after(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  });

  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
  const write = (relative, content) => {
    const file = path.join(projectRoot, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };

  git(projectRoot, 'init', '-b', 'main');
  git(projectRoot, 'config', 'user.name', 'Harness Test');
  git(projectRoot, 'config', 'user.email', 'harness@example.test');
  execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
  git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(projectRoot, 'remote', 'add', 'origin', remote);

  write('README.md', '# Assignments\n\n## 과제 목록\n\n| 과제 | 제목 | 문서 | 발표 |\n|---|---|---|---|\n| OLD | Old row | old | old |\n\n## 저장소 구조\n\nKeep this section.\n');
  write('docs/index.html', '<!-- CODEYSSEY-HARNESS:START --><section>Generated catalog</section><!-- CODEYSSEY-HARNESS:END -->');
  write('submissions/OLD/README.md', '# Old assignment\n');
  write('submissions/NEW-1/README.md', '# App name, not assignment title\n');
  write('docs/OLD/index.html', '<h1>Old</h1>');
  write('docs/NEW-1/index.html', '<h1>New</h1>');
  write('submissions/OTHER/README.md', '# Unexported assignment\n');
  write('submissions/OTHER/notes.txt', 'baseline\n');
  write('artifacts/new-1/harness-state.json', JSON.stringify({
    code: 'NEW-1',
    title: 'Official assignment title',
    github: { owner: 'owner', repo: 'repo', remote, pagesUrl: 'https://owner.github.io/repo/' },
    history: [],
  }));
  git(projectRoot, 'add', '.');
  git(projectRoot, 'commit', '-m', 'Initial fixture');
  git(projectRoot, 'push', '-u', 'origin', 'main');

  write('submissions/OTHER/notes.txt', 'unrelated working-tree change\n');
  git(projectRoot, 'add', 'submissions/OTHER/notes.txt');
  write('submissions/OTHER/notes.txt', 'unrelated staged change\n');

  const result = spawnSync(process.execPath, [cli, 'publish', 'NEW-1', '--push'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, CODyssey_PROJECT_ROOT: projectRoot },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const publishedReadme = git(remote, 'show', 'main:README.md');
  assert.match(publishedReadme, /\| NEW-1 \| Official assignment title \|/);
  assert.doesNotMatch(publishedReadme, /App name, not assignment title/);
  assert.match(publishedReadme, /\| OLD \| Old assignment \|/);
  assert.doesNotMatch(publishedReadme, /Unexported assignment/);
  assert.equal((publishedReadme.match(/CODEYSSEY-HARNESS:START/g) || []).length, 1);
  assert.doesNotMatch(publishedReadme, /\| OLD \| Old row \|/);
  assert.match(publishedReadme, /\[Presentation\]\(https:\/\/owner\.github\.io\/repo\/NEW-1\/\)/);
  assert.ok(!git(remote, 'ls-tree', '-r', '--name-only', 'main').split('\n').includes('docs/index.html'));
  assert.equal(git(remote, 'show', 'main:submissions/OTHER/notes.txt'), 'baseline');
  assert.equal(git(remote, 'show', 'main:submissions/OTHER/README.md'), '# Unexported assignment');
  assert.match(git(projectRoot, 'status', '--short'), /submissions\/OTHER\/notes\.txt/);
});
