import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(harnessRoot, 'scripts/codyssey-harness.mjs');

test('intake approval, artifact transition, plan approval/revision, and validation failures', (t) => {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'codyssey-harness-test-'));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));
  const code = 'QA-TRANSITIONS';
  const assignmentRoot = path.join(projectRoot, 'artifacts', code.toLowerCase());
  const fixtures = path.join(projectRoot, 'fixtures');
  mkdirSync(fixtures, { recursive: true });
  const sourceFile = path.join(fixtures, 'source.md');
  const checklistFile = path.join(fixtures, 'checklist.md');
  const requirementsFile = path.join(fixtures, 'requirements.json');
  const codeMapFile = path.join(fixtures, 'code-map.json');
  const planFile = path.join(fixtures, 'plan.json');
  writeFileSync(sourceFile, 'The portfolio must show a project list.\n');
  writeFileSync(checklistFile, 'Bonus: filter projects by category.\n');
  const reqDraft = {
    items: [
      { title: 'Show projects', category: 'functional', scope: 'required', included: true, description: 'Display the portfolio project list.', acceptanceCriteria: ['The Projects section contains project entries.', 'Each project entry has a title.'], sourceRefs: [{ document: 'source', excerpt: 'The portfolio must show a project list.' }], verification: 'visual' },
      { title: 'Filter projects', category: 'bonus', scope: 'optional', included: null, description: 'Allow filtering projects by category.', acceptanceCriteria: ['Selecting a category limits visible projects.'], sourceRefs: [{ document: 'checklist', excerpt: 'Bonus: filter projects by category.' }], verification: 'runtime' },
    ],
  };
  writeFileSync(requirementsFile, JSON.stringify(reqDraft));
  writeFileSync(codeMapFile, JSON.stringify({ regions: [{ id: 'r1', title: 'Project list', file: 'index.html', language: 'html', kind: 'structure', lineStart: 1, lineEnd: 1, summary: 'Renders project entries.', requirementIds: ['REQ-001'] }, { id: 'r2', title: 'Project list behavior', file: 'js/main.js', language: 'javascript', kind: 'behavior', lineStart: 1, lineEnd: 1, summary: 'Loads project entries.', requirementIds: ['REQ-001'] }], requirementTraces: [{ requirementId: 'REQ-001', flow: 'The Projects section provides the entry point; the article markup renders each project title.', boundary: 'Include the section and its article because together they show the full static project-entry structure.', regionIds: ['r1'] }] }));
  const plan = { status: 'approved', chapters: [{ id: 'ch1', title: 'Project list', purpose: 'Explain how project entries appear.', themes: [{ id: 'th1', title: 'Project markup', takeaway: 'The project section renders data as individual entries.', explanation: 'Each article groups one project title and its details.', concepts: [{ term: 'article', explanation: 'A self-contained piece of page content.' }], result: 'The Projects section displays a titled project entry.', evidence: ['Browser view of the Projects section'] }] }], slides: [{ id: 'cover', type: 'cover', title: 'Transition QA', subtitle: 'Presentation test', chapterIds: ['ch1'] }, { id: 'ch1-cover', type: 'chapter-cover', chapterId: 'ch1' }, { id: 's1', type: 'code', title: 'Project markup', chapterId: 'ch1', themeId: 'th1', requirementIds: ['REQ-001'], file: 'index.html', regionIds: ['r1'] }, { id: 's1-js', type: 'code', title: 'Project loading behavior', chapterId: 'ch1', themeId: 'th1', requirementIds: ['REQ-001'], file: 'js/main.js', regionIds: ['r2'] }, { id: 's2', type: 'terminal', title: 'Build output', chapterId: 'ch1', themeId: 'th1', requirementIds: ['REQ-001'], command: 'npm run build', output: 'Build completed.' }, { id: 's3', type: 'image', title: 'Projects screen', chapterId: 'ch1', themeId: 'th1', requirementIds: ['REQ-001'], src: 'evidence.png', alt: 'Project cards' }] };
  writeFileSync(planFile, JSON.stringify(plan));

  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, CODyssey_PROJECT_ROOT: projectRoot } });
    let output;
    try { output = JSON.parse(result.stdout); } catch { output = null; }
    return { ...result, output };
  };
  const state = () => JSON.parse(readFileSync(path.join(assignmentRoot, 'harness-state.json'), 'utf8'));
  const requirements = () => JSON.parse(readFileSync(path.join(assignmentRoot, 'assignment/requirements.json'), 'utf8'));
  const savedPlan = () => JSON.parse(readFileSync(path.join(assignmentRoot, 'analysis/presentation-plan.json'), 'utf8'));

  let result = run('start', code, '--title', 'Transition QA', '--source-file', sourceFile, '--checklist-file', checklistFile);
  assert.equal(result.status, 0);
  assert.equal(result.output.phase, 'intake');
  assert.equal(JSON.parse(readFileSync(path.join(projectRoot, 'artifacts/codyssey-harness-active.json'), 'utf8')).code, code);

  result = run('save-requirements', code, '--requirements-file', requirementsFile);
  assert.equal(result.status, 0);
  assert.deepEqual(requirements().items.map(({ id }) => id), ['REQ-001', 'REQ-002']);
  assert.equal(requirements().items[1].included, null);
  result = run('request-requirements-approval', code);
  assert.equal(result.status, 1);
  assert.ok(result.output.failed.includes('optional-items-decided'));
  assert.equal(state().phase, 'intake');

  reqDraft.items[1].included = false;
  writeFileSync(requirementsFile, JSON.stringify(reqDraft));
  result = run('save-requirements', code, '--requirements-file', requirementsFile);
  assert.equal(result.status, 0);
  result = run('request-requirements-approval', code);
  assert.equal(result.output.confirmationRequired, true);
  result = run('intent', code, '아니');
  assert.equal(result.output.cancelled, true);
  assert.equal(state().phase, 'intake');
  run('request-requirements-approval', code);
  result = run('intent', code, 'ㅇ');
  assert.equal(result.output.to, 'artifact');
  assert.equal(requirements().status, 'approved');
  assert.equal(state().requirements.status, 'approved');

  result = run('intent', code, '아직 산출물 완료라고 하지 않을게');
  assert.equal(result.output.handled, false);
  result = run('intent', code, '산출물 완료');
  assert.equal(result.status, 1);
  assert.ok(result.output.failed.includes('artifact-file'));
  mkdirSync(path.join(assignmentRoot, 'artifact'), { recursive: true });
  writeFileSync(path.join(assignmentRoot, 'artifact/index.html'), '<main>Projects</main>');
  mkdirSync(path.join(assignmentRoot, 'artifact/js'), { recursive: true });
  writeFileSync(path.join(assignmentRoot, 'artifact/js/main.js'), 'loadProjects();\n');
  writeFileSync(path.join(assignmentRoot, 'artifact/evidence.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Q4sAAAAASUVORK5CYII=', 'base64'));
  result = run('validate', code);
  assert.equal(result.status, 1);
  assert.equal(result.output.summary.criteria.unverified, 2);
  result = run('intent', code, '산출물 완료');
  assert.equal(result.status, 1);
  assert.ok(result.output.failed.includes('acceptance-criteria-verified'));

  const requirementDraft = requirements();
  requirementDraft.items[0].acceptanceCriteria.forEach((criterion) => { criterion.evidence = ['index.html']; });
  writeFileSync(path.join(assignmentRoot, 'assignment/requirements.json'), JSON.stringify(requirementDraft));
  result = run('validate', code);
  assert.equal(result.status, 0);
  assert.equal(result.output.status, 'passed');
  result = run('intent', code, '산출물 완료');
  assert.equal(result.output.confirmationRequired, true);
  result = run('intent', code, '다른 내용을 먼저 볼게');
  assert.equal(result.output.handled, false);
  assert.equal(state().pendingTransition, null);
  assert.equal(state().phase, 'artifact');
  run('intent', code, '산출물 완료');
  result = run('intent', code, '응');
  assert.equal(result.output.to, 'analyze');

  const retryAnalysis = () => {
    result = run('validate', code);
    assert.equal(result.status, 0);
    result = run('intent', code, '산출물 완료');
    assert.equal(result.output.confirmationRequired, true);
    result = run('intent', code, 'ㅇ');
    assert.equal(result.output.to, 'analyze');
  };

  rmSync(path.join(assignmentRoot, 'analysis/code-map.json'), { recursive: true, force: true });
  writeFileSync(planFile, JSON.stringify({ ...plan, slides: undefined }));
  result = run('save-analysis', code, '--plan-file', planFile);
  assert.equal(result.status, 0);
  assert.equal(result.output.status, 'ready');
  assert.equal(existsSync(path.join(assignmentRoot, 'analysis/code-map.json')), false);
  assert.ok(result.output.savedNarrative.some(({ title }) => title === 'Project list'));
  assert.equal(savedPlan().status, 'draft');
  assert.equal(savedPlan().approvedAt, undefined);

  result = run('intent', code, '발표 설계 완료');
  assert.equal(result.output.confirmationRequired, true);
  result = run('intent', code, '네, 진행해줘');
  assert.equal(result.output.to, 'presentation-content');
  assert.equal(result.output.presentation, undefined);
  assert.equal(result.output.agentTask.status, 'queued');
  assert.match(result.output.agentTask.prompt, /validate-slide/);
  assert.match(result.output.agentTask.prompt, /append-slide/);
  assert.doesNotMatch(result.output.agentTask.prompt, /save-presentation-content/);
  const queuedState = JSON.parse(readFileSync(path.join(assignmentRoot, 'harness-state.json'), 'utf8'));
  assert.equal(queuedState.agentTask.status, 'queued');
  assert.equal(queuedState.agentTask.phase, 'presentation-content');
  const taskResult = run('agent-task', code);
  assert.equal(taskResult.output.status, 'queued');
  assert.equal(state().phase, 'presentation-content');
  const contentInput = path.join(fixtures, 'content.json');
  const contentSlides = plan.slides.map((slide, index) => ({
    ...slide,
    slideNumber: index + 1,
    ...(slide.type === 'code' ? {
      learning: {
        concepts: [{ name: 'DOM', kind: '개념', explanation: '문서 구조를 표현하는 객체 모델이다.' }],
        codeBlocks: [{ lines: '1', details: ['이 한 줄이 기능의 입력과 동작을 연결한다.'] }],
      },
    } : {}),
  }));
  writeFileSync(contentInput, JSON.stringify({
    status: 'complete',
    chapters: plan.chapters,
    implementationInventory: [{ id: 'project-list', files: ['index.html', 'js/main.js'] }],
    slideBlueprint: [{ chapterId: 'ch1', themeId: 'th1', slides: contentSlides.filter((slide) => slide.themeId).map(({ id }) => id) }],
    slides: contentSlides,
    codeMap: JSON.parse(readFileSync(codeMapFile, 'utf8')),
  }));
  const contentPlan = savedPlan();
  contentPlan.slides = contentSlides;
  contentPlan.status = 'approved';
  writeFileSync(path.join(assignmentRoot, 'analysis/presentation-plan.json'), JSON.stringify(contentPlan));
  writeFileSync(path.join(assignmentRoot, 'analysis/presentation-content.json'), readFileSync(contentInput));
  result = run('intent', code, '발표 내용 생성 완료');
  assert.equal(result.output.confirmationRequired, true);
  result = run('intent', code, '네, 진행해줘');
  assert.equal(result.output.to, 'learning');
  assert.equal(result.output.presentation.status, 'generated');
  assert.equal(result.output.presentation.html, path.join(assignmentRoot, 'presentation/presentation.html'));
  assert.equal(result.output.presentation.readme, path.join(assignmentRoot, 'presentation/README.md'));
  assert.equal(state().validation.renderStatus, 'generated');
  assert.ok(existsSync(path.join(assignmentRoot, 'presentation/presentation.html')));
  assert.ok(existsSync(path.join(assignmentRoot, 'presentation/README.md')));
  assert.equal(savedPlan().status, 'approved');
  assert.ok(savedPlan().approvedAt);
  result = run('render', code);
  assert.equal(result.status, 0);
  const html = readFileSync(path.join(assignmentRoot, 'presentation/presentation.html'), 'utf8');
  const readme = readFileSync(path.join(assignmentRoot, 'presentation/README.md'), 'utf8');
  assert.deepEqual([...html.matchAll(/data-slide-id="([^"]+)"/g)].map(([, id]) => id), savedPlan().slides.map(({ id }) => id));
  assert.equal((html.match(/<section class="slide /g) || []).length, savedPlan().slides.length);
  assert.match(html, /data-type="cover"/);
  assert.match(html, /data-type="chapter-cover"/);
  assert.doesNotMatch(html, /The project section renders data as individual entries/);
  assert.doesNotMatch(html, /REQ-001/);
  assert.doesNotMatch(html, /Project list · 1-1/);
  assert.match(html, /Chapter 1 · Project list · Project markup/);
  assert.doesNotMatch(html, /<h1>Project markup source<\/h1>/);
  assert.match(html, /<p class="kicker">Chapter 1<\/p>/);
  assert.match(readme, /The project section renders data as individual entries/);
  assert.match(readme, /#### Project markup/);
  assert.match(html, /<span class="hljs-tag">&lt;<span class="hljs-name">main<\/span>&gt;<\/span>/);
  assert.doesNotMatch(html, /<main>Projects<\/main>/);
  assert.match(html, /class="slide terminal-slide"/);
  assert.equal((html.match(/class="slide editor-slide"/g) || []).length, 2);
  assert.match(html, /aria-label="index\.html 전체 코드"/);
  assert.match(html, /aria-label="js\/main\.js 전체 코드"/);
  assert.match(html, /data-source-file="index\.html"/);
  assert.match(html, /data-source-file="js\/main\.js"/);
  assert.match(readme, /\*\*Project markup\*\* \(code\)/);
  assert.match(readme, /\*\*Project loading behavior\*\* \(code\)/);
  assert.match(html, /\.editor-slide\{grid-template-rows:auto minmax\(0,1fr\)\}/);
  assert.match(html, /\.code-content\{grid-template-rows:minmax\(0,1fr\)\}/);
  assert.match(html, /\.editor-window,\.terminal-window\{height:100%;min-height:0\}/);
  assert.match(html, /\.terminal-slide\{grid-template-rows:auto minmax\(0,1fr\) auto\}/);
  assert.match(html, /\.editor-slide,\.terminal-slide\{padding-bottom:76px\}/);
  assert.match(html, /\.editor-slide,\.terminal-slide\{padding-bottom:62px\}/);
  assert.match(html, /\.icon-button\{display:grid;place-items:center;box-sizing:border-box;width:36px;height:36px/);
  assert.match(html, /data-review-open>\x3csvg viewBox="0 0 24 24"/);
  assert.match(html, /class="slide-grammar-toggle icon-button"[^>]*data-grammar-toggle/);
  assert.match(html, /aria-label="문법 검색 모드 켜기" title="문법 검색 모드"/);
  assert.match(html, /\.slide-grammar-toggle\[aria-pressed=true\]\{[^}]*box-shadow:/);
  assert.match(html, /\.slide-grammar-toggle:active\{transform:scale\(\.9\)\}/);
  assert.match(html, /grammarMode=String\(enabled\)/);
  assert.match(html, /data-editor data-language="html" role="region"/);
  assert.match(html, /window\.codysseyGrammarMode/);
  assert.match(html, /cm-grammar-waiting/);
  assert.match(html, /cursor:"none !important"/);
  assert.match(html, /hoverTime:0/);
  assert.match(html, /addEventListener\("pointerleave",\w+\)/);
  assert.doesNotMatch(html, /showLoadingCursor/);
  assert.match(html, /\.grammar-loading-cursor\.visible\{display:block;animation:grammar-loading-spin \.65s linear infinite\}/);
  assert.match(html, /\.cm-editor/);
  assert.match(html, /\.cm-lineNumbers \.cm-gutterElement/);
  assert.match(html, /\.cm-code-selected-gutter/);
  assert.ok((html.match(/cm-code-selected-gutter/g) || []).length >= 2);
  assert.equal((html.match(/<body>/g) || []).length, 1);
  assert.equal((html.match(/<main class="deck"/g) || []).length, 1);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net|unpkg\.com/);
  assert.match(html, /class="slide image-slide"/);
  assert.match(html, /src="\.\.\/artifact\/evidence.png"/);
  assert.doesNotMatch(html, /data-type="text"/);
  assert.match(html, /class="deck" id="deck"/);
  assert.match(html, /\.slide\.active\{display:grid\}/);
  assert.doesNotMatch(html, /id="previous-slide"|id="next-slide"/);
  assert.match(html, /class="chapter-picker"/);
  assert.match(html, /function nextChapter\(\)/);
  assert.match(html, /event\.key==='ArrowRight'/);
  assert.match(readme, /A self-contained piece of page content/);
  assert.match(readme, /\*\*Build output\*\* \(terminal\)/);

  const rerunState = state();
  rerunState.phase = 'analyze';
  writeFileSync(path.join(assignmentRoot, 'harness-state.json'), JSON.stringify(rerunState));
  result = run('save-analysis', code, '--plan-file', planFile);
  assert.equal(result.status, 0);
  assert.equal(state().phase, 'analyze');
  assert.equal(savedPlan().status, 'draft');
  assert.equal(savedPlan().approvedAt, undefined);
  result = run('validate', code);
  assert.equal(result.status, 0);
  assert.equal(result.output.status, 'passed');
  assert.equal(result.output.summary.excluded, 1);
  assert.deepEqual(requirements().items[0].acceptanceCriteria.map(({ id, status }) => [id, status]), [['REQ-001-C01', 'fulfilled'], ['REQ-001-C02', 'fulfilled']]);

  const tracked = requirements();
  tracked.items[0].acceptanceCriteria[0].evidence = ['missing-evidence.txt'];
  tracked.items[0].acceptanceCriteria[1].evidence = [];
  writeFileSync(path.join(assignmentRoot, 'assignment/requirements.json'), JSON.stringify(tracked));
  result = run('validate', code);
  assert.equal(result.output.items[0].status, 'partial');
  assert.deepEqual(result.output.items[0].acceptanceCriteria.map(({ status }) => status), ['partial', 'unverified']);
  assert.deepEqual(result.output.summary.criteria, { fulfilled: 0, partial: 1, missing: 0, unverified: 1, excluded: 1 });

  const nonCodePlan = { chapters: [{ id: 'ch2', title: 'Project outcome', purpose: 'Explain the requirement through its visible result.', themes: [{ id: 'th2', title: 'Visual result', takeaway: 'The project list is clear.', explanation: 'The list is presented as a set of readable entries.', concepts: [], result: 'Visitors can scan the project entries.', evidence: ['Captured Projects section'] }] }], slides: [{ id: 'cover', type: 'cover', title: 'Transition QA', chapterIds: ['ch2'] }, { id: 'ch2-cover', type: 'chapter-cover', chapterId: 'ch2' }, { id: 's-image', type: 'image', title: 'Projects screen', chapterId: 'ch2', themeId: 'th2', requirementIds: ['REQ-001'], src: 'evidence.png', alt: 'Project cards' }] };
  writeFileSync(codeMapFile, JSON.stringify({ regions: [], requirementTraces: [{ requirementId: 'REQ-001', flow: 'The visible project section presents its content directly.', boundary: 'This requirement is explained by the rendered screen; a source-code excerpt does not add useful presentation evidence.', regionIds: [] }] }));
  writeFileSync(planFile, JSON.stringify(nonCodePlan));
  result = run('save-analysis', code, '--code-map-file', codeMapFile, '--plan-file', planFile);
  assert.equal(result.status, 0);
  assert.equal(result.output.status, 'ready');
  assert.equal(result.output.codeMap, null);
});

test('restart preserves an existing requirements definition and standalone affirmative continues agent phases', (t) => {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'codyssey-harness-restart-'));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));
  const code = 'QA-RESTART';
  const fixtures = path.join(projectRoot, 'fixtures');
  mkdirSync(fixtures, { recursive: true });
  const sourceFile = path.join(fixtures, 'source.md');
  const checklistFile = path.join(fixtures, 'checklist.md');
  writeFileSync(sourceFile, 'Keep this source.');
  writeFileSync(checklistFile, '');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, CODyssey_PROJECT_ROOT: projectRoot } });
  assert.equal(run('start', code, '--title', 'Restart QA', '--source-file', sourceFile, '--checklist-file', checklistFile).status, 0);
  const assignmentRoot = path.join(projectRoot, 'artifacts', code.toLowerCase());
  const requirementsPath = path.join(assignmentRoot, 'assignment/requirements.json');
  const saved = { version: 1, status: 'draft', items: [{ title: 'Persisted', category: 'functional', scope: 'required', included: true, description: 'Persisted requirement.', acceptanceCriteria: [{ text: 'Still here', status: 'unverified', evidence: [] }], sourceRefs: [{ document: 'source', excerpt: 'Keep this source.' }], verification: 'static' }] };
  writeFileSync(requirementsPath, JSON.stringify(saved));
  rmSync(path.join(assignmentRoot, 'harness-state.json'));
  assert.equal(run('start', code, '--title', 'Restart QA', '--source-file', sourceFile, '--checklist-file', checklistFile).status, 0);
  assert.equal(JSON.parse(readFileSync(requirementsPath, 'utf8')).items[0].title, 'Persisted');
});

test('requirements drafts must cite exact preserved assignment text and can only be saved during intake', (t) => {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'codyssey-harness-intake-'));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));
  const fixtures = path.join(projectRoot, 'fixtures');
  mkdirSync(fixtures, { recursive: true });
  const sourceFile = path.join(fixtures, 'source.md');
  const checklistFile = path.join(fixtures, 'checklist.md');
  const requirementsFile = path.join(fixtures, 'requirements.json');
  writeFileSync(sourceFile, 'The page must include a contact form.\n');
  writeFileSync(checklistFile, 'Optional: add a theme toggle.\n');
  const env = { ...process.env, CODyssey_PROJECT_ROOT: projectRoot };
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
  assert.equal(run('start', 'QA-INTAKE', '--source-file', sourceFile, '--checklist-file', checklistFile).status, 0);

  const invalidDraft = { items: [{ title: 'Contact form', category: 'functional', scope: 'required', included: true, description: 'Provide a way to contact the owner.', acceptanceCriteria: ['A contact form is present.'], sourceRefs: [{ document: 'source', excerpt: 'A contact form is present.' }], verification: 'visual' }] };
  writeFileSync(requirementsFile, JSON.stringify(invalidDraft));
  const rejectedQuote = run('save-requirements', 'QA-INTAKE', '--requirements-file', requirementsFile);
  assert.equal(rejectedQuote.status, 1);
  assert.match(rejectedQuote.stderr, /source\/checklist excerpt/);

  invalidDraft.items[0].sourceRefs[0].excerpt = 'The page must include a contact form.';
  writeFileSync(requirementsFile, JSON.stringify(invalidDraft));
  assert.equal(run('save-requirements', 'QA-INTAKE', '--requirements-file', requirementsFile).status, 0);
  let result = run('request-requirements-approval', 'QA-INTAKE');
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).confirmationRequired, true);
  result = run('intent', 'QA-INTAKE', '응');
  assert.equal(JSON.parse(result.stdout).to, 'artifact');
  const saveAfterApproval = run('save-requirements', 'QA-INTAKE', '--requirements-file', requirementsFile);
  assert.equal(saveAfterApproval.status, 1);
  assert.match(saveAfterApproval.stderr, /only be drafted in intake phase/);
});
