import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(harnessRoot, 'scripts/codyssey-harness.mjs');

test('export copies source files and presentation without local secrets or generated dependencies', (t) => {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'codyssey-harness-export-'));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));
  const write = (relative, content) => {
    const file = path.join(projectRoot, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };

  write('artifacts/EXP-1/harness-state.json', JSON.stringify({ code: 'EXP-1', history: [] }));
  write('artifacts/exp-1/artifact/README.md', '# Export fixture\n');
  write('artifacts/exp-1/artifact/src/main.js', 'export {};\n');
  write('artifacts/exp-1/artifact/.env', 'SECRET=do-not-copy\n');
  write('artifacts/exp-1/artifact/.env.local', 'SECRET=do-not-copy\n');
  write('artifacts/exp-1/artifact/.env.example', 'VITE_FIREBASE_API_KEY=\n');
  write('artifacts/exp-1/artifact/dist/index.html', '<h1>Build</h1>');
  write('artifacts/exp-1/artifact/node_modules/pkg/index.js', 'module.exports = 1;');
  write('artifacts/exp-1/presentation/presentation.html', '<h1>Presentation</h1>');
  write('artifacts/exp-1/presentation/README.md', '# Presentation\n');
  write('artifacts/exp-1/presentation/presentation-background.jpg', 'image bytes');

  const result = spawnSync(process.execPath, [cli, 'export', 'EXP-1'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, CODyssey_PROJECT_ROOT: projectRoot },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const exported = path.join(projectRoot, 'submissions/EXP-1/artifact');
  assert.ok(existsSync(path.join(exported, 'src/main.js')));
  assert.ok(existsSync(path.join(exported, '.env.example')));
  assert.equal(existsSync(path.join(exported, '.env')), false);
  assert.equal(existsSync(path.join(exported, '.env.local')), false);
  assert.equal(existsSync(path.join(exported, 'dist')), false);
  assert.equal(existsSync(path.join(exported, 'node_modules')), false);
  assert.ok(existsSync(path.join(projectRoot, 'docs/EXP-1/index.html')));
  assert.equal(readFileSync(path.join(projectRoot, 'docs/EXP-1/presentation-background.jpg'), 'utf8'), 'image bytes');
  assert.match(readFileSync(path.join(projectRoot, 'submissions/EXP-1/README.md'), 'utf8'), /Export fixture/);
});
