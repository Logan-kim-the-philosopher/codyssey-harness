import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assignmentPaths, PROJECT_ROOT, loadState, saveState } from './storage.mjs';

function requireFile(file, label) {
  if (!existsSync(file)) throw new Error(`${label} not found: ${file}`);
}

export function exportAssignment(code) {
  const state = loadState(code);
  const paths = assignmentPaths(code);
  requireFile(paths.artifactDir, 'artifact directory');
  requireFile(path.join(paths.artifactDir, 'README.md'), 'application README');
  requireFile(paths.presentationFile, 'presentation');
  requireFile(paths.readmeFile, 'README');

  const submissionRoot = path.join(PROJECT_ROOT, 'submissions', code.toUpperCase());
  const docsRoot = path.join(PROJECT_ROOT, 'docs', code.toUpperCase());
  mkdirSync(submissionRoot, { recursive: true });
  mkdirSync(docsRoot, { recursive: true });
  cpSync(paths.artifactDir, path.join(submissionRoot, 'artifact'), {
    recursive: true,
    force: true,
    filter: (source) => {
      const relative = path.relative(paths.artifactDir, source);
      const segments = relative.split(path.sep);
      const name = path.basename(source);
      if (segments.some((segment) => ['.git', 'node_modules', 'dist', '.DS_Store'].includes(segment))) return false;
      return name === '.env.example' || !/^\.env(?:\.|$)/.test(name);
    },
  });
  cpSync(path.join(paths.artifactDir, 'README.md'), path.join(submissionRoot, 'README.md'), { force: true });
  cpSync(paths.presentationFile, path.join(docsRoot, 'index.html'), { force: true });
  const presentationBackground = path.join(paths.presentationDir, 'presentation-background.jpg');
  if (existsSync(presentationBackground)) cpSync(presentationBackground, path.join(docsRoot, 'presentation-background.jpg'), { force: true });
  const presentationAssets = path.join(paths.presentationDir, 'assets');
  if (existsSync(presentationAssets)) cpSync(presentationAssets, path.join(docsRoot, 'assets'), { recursive: true, force: true });

  const exported = {
    submission: path.relative(PROJECT_ROOT, submissionRoot),
    pages: path.relative(PROJECT_ROOT, docsRoot),
    artifact: path.relative(PROJECT_ROOT, path.join(submissionRoot, 'artifact')),
  };
  state.export = { status: 'exported', ...exported, at: new Date().toISOString() };
  state.history.push({ event: 'exported', ...exported, at: state.export.at });
  saveState(state);
  writeFileSync(path.join(submissionRoot, 'export-manifest.json'), `${JSON.stringify({ code, ...exported }, null, 2)}\n`, 'utf8');
  return exported;
}
