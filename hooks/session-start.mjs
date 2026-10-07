#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState } from '../src/storage.mjs';

const harnessCli = fileURLToPath(new URL('../scripts/codyssey-harness.mjs', import.meta.url));

const code = process.env.CODyssey_ASSIGNMENT_CODE || activeCode(process.env.CODEX_CWD || process.cwd());
if (!code) {
  process.stdout.write(JSON.stringify({ ok: true, handled: false, reason: 'no-active-assignment' }));
  process.exit(0);
}

try {
  const state = loadState(code);
  process.stdout.write(JSON.stringify({
    ok: true,
    handled: true,
    assignment: state.code,
    title: state.title,
    phase: state.phase,
    agentTask: state.agentTask || null,
    agentTaskCommand: state.agentTask?.status === 'queued' ? `node ${harnessCli} consume-agent-task ${state.code}` : null,
    next: nextAction(state.phase),
  }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
}

function nextAction(phase) {
  return {
    intake: '과제 원문과 평가표에서 요구사항 정의서 초안을 만들고 사용자 확인을 받습니다.',
    artifact: '최종 산출물을 자유롭게 제작합니다.',
    analyze: '코드베이스를 분석하고 발표 구조를 협의합니다.',
    presentation: '합의된 발표 구조로 README와 HTML을 생성합니다.',
    learning: '발표에 필요한 개념만 학습합니다.',
    submission: '제출물 검증과 export/publish를 진행합니다.',
    published: '제출과 배포가 완료되었습니다.',
  }[phase] || '현재 상태를 확인합니다.';
}

function activeCode(cwd) {
  const file = path.join(cwd, 'artifacts', 'codyssey-harness-active.json');
  if (!existsSync(file)) return null;
  try {
    const code = JSON.parse(readFileSync(file, 'utf8')).code || null;
    return code && existsSync(path.join(cwd, 'artifacts', code.toLowerCase(), 'harness-state.json')) ? code : null;
  } catch { return null; }
}
