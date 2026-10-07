import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assignmentPaths, loadState, saveState } from './storage.mjs';
import { confirmationChoice, detectIntent, intentDefinition } from './intent-router.mjs';
import { analysisReadiness } from './analysis.mjs';
import { renderAssignment } from './render.mjs';

const confirmationPrompts = {
  'requirements-approved': '이 요구사항 정의서와 체크리스트를 확정하고 산출물 제작 단계로 넘어갈까요?',
  'artifact-complete': '산출물 단계를 마치고 분석 단계로 넘어갈까요?',
  'presentation-design-complete': '현재 발표 설계를 승인하고 발표자료 생성 단계로 넘어갈까요?',
  'presentation-content-complete': '발표 내용을 확정하고 발표자료를 렌더링한 뒤 학습 단계로 넘어갈까요?',
  submit: '제출 준비 단계로 넘어갈까요?',
};

const nextActionFor = (phase) => ({
  analyze: { actor: 'agent', action: 'design-presentation-narrative', command: 'save-analysis', pause: 'presentation-design-approved', prompt: '요구사항과 artifact를 다시 읽고, 채팅에서 사용자와 합의한 바로 그 챕터·테마 구조를 narrative-only presentation-plan으로 작성하세요. 채팅에 제안만 남기지 말고 사용자의 수정·승인 내용을 반영한 뒤 반드시 save-analysis --plan-file을 실행해 /analysis/presentation-plan.json에 저장하세요. 저장 결과의 chapters와 themes를 사용자에게 다시 보여주고, 표시된 구조와 저장된 JSON이 다르면 발표 설계를 승인시키지 마세요. 코드맵, 코드 범위, 슬라이드 수는 분석 단계에서 만들지 마세요.' },
 'presentation-content': { actor: 'agent', action: 'explore-materials-and-create-slide-content', command: 'validate-slide + append-slide', pause: 'material-user-conflict', prompt: '승인된 설계만 사용하세요. 먼저 메타데이터와 첫 cover 1장만 status=draft로 저장하고, 이후 각 슬라이드는 validate-slide 통과 후 append-slide로 정확히 한 장씩 추가하세요. 전체 slides를 미리 생성하거나 완성 파일을 복사하지 말고, 마지막에만 status를 complete로 바꾸세요.' },
  learning: { actor: 'agent', action: 'teach-slide-concepts', command: null, pause: null },
  submission: { actor: 'agent', action: 'validate-export-and-prepare-submission', command: 'validate', pause: 'external-mutation' },
}[phase] || null);

function check(state, intent) {
  const paths = assignmentPaths(state.code);
  const checks = [];
  if (intent === 'requirements-approved') {
    checks.push(['requirements-file', existsSync(paths.requirementsFile)]);
    const requirements = existsSync(paths.requirementsFile) ? JSON.parse(readFileSync(paths.requirementsFile, 'utf8')) : null;
    checks.push(['requirements-draft', requirements?.status === 'draft']);
    checks.push(['requirements-items', Array.isArray(requirements?.items) && requirements.items.length > 0]);
    checks.push(['optional-items-decided', Array.isArray(requirements?.items) && requirements.items.every((item) => item.scope === 'required' || typeof item.included === 'boolean')]);
  } else if (intent === 'artifact-complete') {
    checks.push(['artifact-directory', existsSync(paths.artifactDir)]);
    checks.push(['artifact-file', existsSync(paths.artifactDir) && readdirSync(paths.artifactDir, { withFileTypes: true }).some((entry) => entry.isFile() || entry.isDirectory())]);
    checks.push(['requirements-file', existsSync(paths.requirementsFile)]);
    const requirements = existsSync(paths.requirementsFile) ? JSON.parse(readFileSync(paths.requirementsFile, 'utf8')) : null;
    const activeItems = requirements?.items?.filter((item) => item.scope !== 'optional' || item.included === true) || [];
    const criteriaVerified = activeItems.length > 0 && activeItems.every((item) => Array.isArray(item.acceptanceCriteria) && item.acceptanceCriteria.length > 0 && item.acceptanceCriteria.every((criterion) => {
      const evidence = Array.isArray(criterion.evidence) ? criterion.evidence : [];
      return criterion.status === 'fulfilled' && evidence.length > 0 && evidence.every((entry) => {
        if (typeof entry === 'object' && entry !== null) {
          return entry.type === 'agent-check' && entry.status === 'passed' && entry.note?.trim();
        }
        return existsSync(path.join(paths.assignmentRoot, entry)) || existsSync(path.join(paths.artifactDir, entry));
      });
    }));
    checks.push(['approved-requirements', requirements?.status === 'approved' && activeItems.length > 0]);
    checks.push(['acceptance-criteria-verified', criteriaVerified]);
    checks.push(['validation-passed', state.validation?.status === 'passed']);
  } else if (intent === 'presentation-design-complete') {
    checks.push(['analysis-plan', existsSync(paths.analysisPlanFile)]);
    const readiness = analysisReadiness(state.code);
    checks.push(['analysis-requirement-traceability', readiness.ready]);
  } else if (intent === 'presentation-content-complete') {
    checks.push(['presentation-content-file', existsSync(paths.presentationContentFile)]);
    const content = existsSync(paths.presentationContentFile) ? JSON.parse(readFileSync(paths.presentationContentFile, 'utf8')) : null;
    checks.push(['presentation-content-complete', content?.status === 'complete' || content?.status === 'approved']);
    checks.push(['presentation-content-chapters', Array.isArray(content?.chapters) && content.chapters.length > 0]);
    checks.push(['presentation-implementation-inventory', Array.isArray(content?.implementationInventory) && content.implementationInventory.length > 0]);
    checks.push(['presentation-slide-blueprint', Array.isArray(content?.slideBlueprint) && content.slideBlueprint.length > 0 && content.slideBlueprint.every((entry) => Array.isArray(entry.slides) && entry.slides.length > 0)]);
    const contentSlides = Array.isArray(content?.slides) ? content.slides : [];
    checks.push(['presentation-content-slide-ids', contentSlides.length > 0 && new Set(contentSlides.map((slide) => slide.id)).size === contentSlides.length]);
    checks.push(['presentation-content-slide-numbers', contentSlides.length > 0 && contentSlides.every((slide, index) => slide.slideNumber === index + 1)]);
    checks.push(['presentation-learning-data', contentSlides.filter((slide) => slide.type === 'code').every((slide) => Array.isArray(slide.learning?.codeBlocks) && slide.learning.codeBlocks.length > 0)]);
  } else if (intent === 'submit') {
    checks.push(['artifact-directory', existsSync(paths.artifactDir)]);
    checks.push(['presentation-file', existsSync(paths.presentationFile)]);
    checks.push(['readme-file', existsSync(paths.readmeFile)]);
    checks.push(['requirements-file', existsSync(paths.requirementsFile)]);
    checks.push(['validation-passed', state.validation?.status === 'passed']);
  }
  return checks;
}

export function requestTransition(code, intent) {
  const state = loadState(code);
  const definition = intentDefinition(intent);
  if (!definition) return { ok: false, handled: true, reason: 'unknown-intent', intent };
  if (!definition.from.includes(state.phase)) {
    return { ok: false, handled: true, reason: 'invalid-phase', phase: state.phase, expected: definition.from, intent };
  }
  const checks = check(state, intent);
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) return { ok: false, handled: true, reason: 'completion-failed', phase: state.phase, intent, failed };
  state.pendingTransition = { intent, from: state.phase, to: definition.to, requestedAt: new Date().toISOString() };
  state.history.push({ event: 'phase-transition-confirmation-requested', intent, from: state.phase, to: definition.to, at: state.pendingTransition.requestedAt });
  saveState(state);
  return { ok: true, handled: true, confirmationRequired: true, intent, from: state.phase, to: definition.to, prompt: confirmationPrompts[intent], nextAction: nextActionFor(definition.to), state };
}

export function routeMessage(code, message) {
  const state = loadState(code);
  const startContent = String(message || '').trim().replace(/[.!?。！？]+$/u, '').trim();
  if (state.phase === 'presentation-content' && /발표\s*내용\s*생성\s*(진행|시작)/u.test(startContent)) {
    const nextAction = nextActionFor(state.phase);
    state.agentTask = { status: 'queued', phase: state.phase, prompt: nextAction.prompt, queuedAt: new Date().toISOString() };
    state.history.push({ event: 'agent-task-queued', phase: state.phase, at: state.agentTask.queuedAt });
    saveState(state);
    return { ok: true, handled: true, continued: true, phase: state.phase, nextAction, agentTask: state.agentTask, state };
  }
  if (state.pendingTransition) {
    const pending = state.pendingTransition;
    const choice = confirmationChoice(message);
    if (state.phase !== pending.from) {
      state.pendingTransition = null;
      state.history.push({ event: 'phase-transition-confirmation-expired', intent: pending.intent, at: new Date().toISOString() });
      saveState(state);
      return { ok: false, handled: true, reason: 'stale-confirmation', phase: state.phase, intent: pending.intent };
    }
    if (choice === 'yes') {
      const checks = check(state, pending.intent);
      const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
      if (failed.length) {
        state.pendingTransition = null;
        state.history.push({ event: 'phase-transition-blocked', intent: pending.intent, failed, at: new Date().toISOString() });
        saveState(state);
        return { ok: false, handled: true, reason: 'completion-failed', phase: state.phase, intent: pending.intent, failed };
      }
      if (pending.intent === 'requirements-approved') {
        const paths = assignmentPaths(state.code);
        const requirements = JSON.parse(readFileSync(paths.requirementsFile, 'utf8'));
        requirements.status = 'approved';
        requirements.approvedAt = new Date().toISOString();
        writeFileSync(paths.requirementsFile, `${JSON.stringify(requirements, null, 2)}\n`, 'utf8');
        state.requirements.status = 'approved';
        state.requirements.approvedAt = requirements.approvedAt;
      } else if (pending.intent === 'presentation-design-complete') {
        const paths = assignmentPaths(state.code);
        const plan = JSON.parse(readFileSync(paths.analysisPlanFile, 'utf8'));
        if (!Array.isArray(plan.chapters) || !plan.chapters.length || plan.slides?.length) {
          state.pendingTransition = null;
          state.history.push({ event: 'presentation-design-approval-blocked', reason: 'plan-is-not-narrative-only', at: new Date().toISOString() });
          saveState(state);
          return { ok: false, handled: true, reason: 'completion-failed', phase: state.phase, intent: pending.intent, failed: ['narrative-only-presentation-plan'] };
        }
        plan.status = 'approved';
        plan.approvedAt = new Date().toISOString();
        writeFileSync(paths.analysisPlanFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
        // A newly approved narrative must never inherit content or rendered files from an older run.
        rmSync(paths.presentationContentFile, { force: true });
        rmSync(paths.analysisPlanFile.replace('presentation-plan.json', 'code-map.json'), { force: true });
        rmSync(paths.presentationFile, { force: true });
        rmSync(paths.readmeFile, { force: true });
        rmSync(paths.presentationDir, { recursive: true, force: true });
        state.history.push({ event: 'presentation-content-invalidated', reason: 'new-presentation-design-approved', at: new Date().toISOString() });
      } else if (pending.intent === 'artifact-complete' && state.analysis?.status === 'blocked') {
        state.analysis = { status: 'reopened', previousFindings: state.analysis.findings || [], reopenedAt: new Date().toISOString() };
      }
      const previousPhase = state.phase;
      state.phase = pending.to;
      state.pendingTransition = null;
      state.history.push({ event: 'phase-transition', intent: pending.intent, from: previousPhase, to: state.phase, at: new Date().toISOString() });
      const nextAction = nextActionFor(state.phase);
      state.agentTask = nextAction?.actor === 'agent'
        ? { status: 'queued', phase: state.phase, prompt: nextAction.prompt, queuedAt: new Date().toISOString() }
        : null;
      saveState(state);
      if (pending.intent === 'presentation-content-complete') {
        try {
          const presentation = renderAssignment(code);
          return {
            ok: true,
            handled: true,
            transitioned: true,
            intent: pending.intent,
            from: previousPhase,
            to: state.phase,
            presentation: { status: 'generated', ...presentation },
            state: loadState(code),
          };
        } catch (error) {
          const current = loadState(code);
          current.phase = previousPhase;
          current.history.push({ event: 'presentation-render-failed', error: error.message, at: new Date().toISOString() });
          current.validation = { ...(current.validation || {}), renderStatus: 'failed', renderError: error.message };
          saveState(current);
          return {
            ok: false,
            handled: true,
            transitioned: true,
            reason: 'presentation-render-failed',
            intent: pending.intent,
            from: previousPhase,
            to: previousPhase,
            error: error.message,
            state: current,
          };
        }
      }
      return { ok: true, handled: true, transitioned: true, intent: pending.intent, from: previousPhase, to: state.phase, nextAction, agentTask: nextAction?.actor === 'agent' ? { status: 'queued', phase: state.phase, prompt: nextAction.prompt } : null, state };
    }
    state.pendingTransition = null;
    state.history.push({ event: choice === 'no' ? 'phase-transition-cancelled' : 'phase-transition-confirmation-dismissed', intent: pending.intent, at: new Date().toISOString() });
    saveState(state);
    if (choice === 'no') return { ok: true, handled: true, cancelled: true, intent: pending.intent, phase: state.phase };
  }

  // With no confirmation pending, a standalone affirmative means continue the
  // current agent-owned phase instead of becoming a no-op.
  if (confirmationChoice(message) === 'yes' && ['analyze', 'presentation-content', 'learning', 'submission'].includes(state.phase)) {
    const nextAction = nextActionFor(state.phase);
    state.agentTask = nextAction?.actor === 'agent'
      ? { status: 'queued', phase: state.phase, prompt: nextAction.prompt, queuedAt: new Date().toISOString() }
      : null;
    saveState(state);
    return { ok: true, handled: true, continued: true, phase: state.phase, nextAction, agentTask: nextAction?.actor === 'agent' ? { status: 'queued', phase: state.phase, prompt: nextAction.prompt } : null, state };
  }

  const match = detectIntent(message);
  if (!match) return { ok: true, handled: false, state };
  return requestTransition(code, match.intent);
}
