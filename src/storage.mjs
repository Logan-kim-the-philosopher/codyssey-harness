import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const HARNESS_ROOT = path.resolve(new URL('..', import.meta.url).pathname);
export const PROJECT_ROOT = path.resolve(
  process.env.CODYSSEY_PROJECT_ROOT || process.env.CODyssey_PROJECT_ROOT || process.env.CODEX_CWD || process.cwd(),
);

export function assignmentPaths(code) {
  const key = String(code).trim().toLowerCase();
  const assignmentRoot = path.join(PROJECT_ROOT, 'artifacts', key);
  return {
    key,
    assignmentRoot,
    assignmentDir: path.join(assignmentRoot, 'assignment'),
    artifactDir: path.join(assignmentRoot, 'artifact'),
    analysisDir: path.join(assignmentRoot, 'analysis'),
    presentationDir: path.join(assignmentRoot, 'presentation'),
    learningDir: path.join(assignmentRoot, 'learning'),
    stateFile: path.join(assignmentRoot, 'harness-state.json'),
    requirementsFile: path.join(assignmentRoot, 'assignment', 'requirements.json'),
    analysisPlanFile: path.join(assignmentRoot, 'analysis', 'presentation-plan.json'),
    presentationContentFile: path.join(assignmentRoot, 'analysis', 'presentation-content.json'),
    presentationFile: path.join(assignmentRoot, 'presentation', 'presentation.html'),
    readmeFile: path.join(assignmentRoot, 'presentation', 'README.md'),
  };
}

export function activeAssignmentPath() {
  return path.join(PROJECT_ROOT, 'artifacts', 'codyssey-harness-active.json');
}

export function ensureAssignmentDirs(paths) {
  for (const dir of [paths.assignmentRoot, paths.assignmentDir, paths.artifactDir, paths.analysisDir, paths.presentationDir, paths.learningDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadState(code) {
  const paths = assignmentPaths(code);
  if (!existsSync(paths.stateFile)) throw new Error(`Assignment not found: ${code}`);
  return JSON.parse(readFileSync(paths.stateFile, 'utf8'));
}

export function saveState(state) {
  const paths = assignmentPaths(state.code);
  ensureAssignmentDirs(paths);
  writeFileSync(paths.stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  writeFileSync(activeAssignmentPath(), `${JSON.stringify({ code: state.code, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}

export function relativePaths(code) {
  const paths = assignmentPaths(code);
  return {
    artifact: path.relative(PROJECT_ROOT, paths.artifactDir),
    presentation: path.relative(PROJECT_ROOT, paths.presentationDir),
    submission: path.join('submissions', code.toUpperCase()),
  };
}
