import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { HARNESS_ROOT, PROJECT_ROOT } from './storage.mjs';

const START = '<!-- CODEYSSEY-HARNESS:START -->';
const END = '<!-- CODEYSSEY-HARNESS:END -->';

function assignments() {
  const root = path.join(PROJECT_ROOT, 'submissions');
  if (!existsSync(root)) return [];
  const available = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const completed = available.filter((entry) =>
    existsSync(path.join(root, entry.name, 'README.md'))
      && existsSync(path.join(PROJECT_ROOT, 'docs', entry.name, 'index.html')),
  ).map((entry) => {
    const code = entry.name;
    const readme = path.join(root, code, 'README.md');
    let title = code;
    const artifactKey = code.toLowerCase();
    const statePaths = [
      path.join(PROJECT_ROOT, 'artifacts', artifactKey, 'harness-state.json'),
      path.join(PROJECT_ROOT, 'artifacts', artifactKey, 'state.json'),
    ];
    for (const statePath of statePaths) {
      if (!existsSync(statePath)) continue;
      try {
        const assignmentTitle = JSON.parse(readFileSync(statePath, 'utf8')).title;
        if (typeof assignmentTitle === 'string' && assignmentTitle.trim()) {
          title = assignmentTitle.trim();
          break;
        }
      } catch {
        // Fall back to the submission README when optional state is unavailable or malformed.
      }
    }
    if (title === code && existsSync(readme)) {
      const match = readFileSync(readme, 'utf8').match(/^#\s+(.+)$/m);
      if (match) title = match[1].trim();
    }
    return { code, title, readme: `submissions/${code}/README.md` };
  });
  const completedCodes = new Set(completed.map(({ code }) => code.toUpperCase()));
  const upcomingFile = path.join(HARNESS_ROOT, 'config', 'upcoming-assignments.json');
  const configuredUpcoming = existsSync(upcomingFile) ? JSON.parse(readFileSync(upcomingFile, 'utf8')) : [];
  const upcoming = configuredUpcoming.filter((item) =>
    item.code && item.title && !completedCodes.has(String(item.code).toUpperCase()),
  ).map((item) => ({
    code: String(item.code).toUpperCase(),
    title: item.title,
    readme: `submissions/${String(item.code).toUpperCase()}/README.md`,
  }));
  return [...completed, ...upcoming].sort((a, b) => a.code.localeCompare(b.code));
}

function pagesRoot() {
  const root = path.join(PROJECT_ROOT, 'artifacts');
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    const stateFile = ['harness-state.json', 'state.json']
      .map((name) => path.join(root, entry.name, name))
      .find(existsSync);
    if (!stateFile) continue;
    try {
      const state = JSON.parse(readFileSync(stateFile, 'utf8'));
      if (!state.github?.pagesUrl) continue;
      const url = new URL(state.github.pagesUrl);
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.at(-1)?.toLowerCase() === String(state.code || entry.name).toLowerCase()) segments.pop();
      url.pathname = `/${segments.length ? `${segments.join('/')}/` : ''}`;
      url.search = '';
      url.hash = '';
      return url.href;
    } catch {
      // Ignore malformed assignment state while locating the configured Pages root.
    }
  }
  return null;
}

function block(items, baseUrl) {
  const rows = items.length
    ? items.map((item) => {
      const pages = baseUrl ? new URL(`${item.code}/`, baseUrl).href : `docs/${item.code}/`;
      return `| ${item.code} | ${item.title} | [README](${item.readme}) | [Presentation](${pages}) |`;
    }).join('\n')
    : '| - | 아직 제출된 과제가 없습니다. | - | - |';
  return `${START}\n## 과제 목록\n\n| 과제 | 제목 | 문서 | 발표 |\n|---|---|---|---|\n${rows}\n${END}`;
}

function updateReadme(file, content) {
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const markerPattern = new RegExp(`${START}[\\s\\S]*?${END}`);
  let next = previous.replace(markerPattern, '').trimEnd();
  const legacyHeading = /^## 과제 목록[ \t]*$/m.exec(next);
  if (legacyHeading) {
    const headingPattern = /^## /gm;
    headingPattern.lastIndex = legacyHeading.index + legacyHeading[0].length;
    const nextHeading = headingPattern.exec(next);
    const before = next.slice(0, legacyHeading.index).trimEnd();
    const after = nextHeading ? next.slice(nextHeading.index).trimStart() : '';
    next = [before, content, after].filter(Boolean).join('\n\n') + '\n';
  } else {
    next = `${next}${next ? '\n\n' : ''}${content}\n`;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, next, 'utf8');
}

export function renderHub() {
  const items = assignments();
  updateReadme(path.join(PROJECT_ROOT, 'README.md'), block(items, pagesRoot()));
  const legacyHub = path.join(PROJECT_ROOT, 'docs', 'index.html');
  if (existsSync(legacyHub)) {
    const previous = readFileSync(legacyHub, 'utf8');
    if (previous.includes(START) && previous.includes(END)) unlinkSync(legacyHub);
  }
  return { assignments: items.length, readme: 'README.md' };
}
