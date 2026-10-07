# Codyssey Harness

Codyssey 과제를 `intake -> artifact -> analyze -> presentation-content -> learning -> submission` 흐름으로 관리하는 Codex 기반 하네스입니다. 요구사항의 근거와 승인 상태를 보존하고, 발표 슬라이드를 검증 가능한 작은 단위로 생성하며, README와 GitHub Pages 제출을 돕습니다.

## 구성

- `scripts/`, `src/`: Node.js CLI, 상태 전환, 요구사항 검증, 발표 렌더링·내보내기·게시
- `hooks/`: Codex `SessionStart`, `UserPromptSubmit` 진입점
- `skills/`: 과제 진행 및 발표 콘텐츠 생성 지침
- `config/`: 워크플로, 완료 조건, JSON 스키마, README에 표시할 예정 과제
- `tests/`: 전환, 내보내기, 렌더링 보조 기능, 게시 격리 테스트

## 요구 환경

- Node.js 20 이상
- Codex CLI 또는 Codex 앱
- Git; GitHub 게시를 할 때는 인증된 GitHub CLI(`gh`) 또는 SSH 설정

## 설치

저장소를 프로젝트 바깥의 안정적인 위치에 복제한 뒤:

```bash
npm ci
```

Codex가 하네스 지침을 찾을 수 있도록 `skills/codyssey-harness`와 `skills/presentation-content-generator`를 사용자의 `$CODEX_HOME/skills/` 아래에 복사합니다. 기본 `$CODEX_HOME`은 `~/.codex`입니다.

프로젝트 저장소의 Codex hook 설정 파일에 아래 명령을 등록합니다. `<HARNESS_DIR>`는 이 저장소를 복제한 절대 경로입니다.

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume|clear",
      "hooks": [{ "type": "command", "command": "node <HARNESS_DIR>/hooks/session-start.mjs" }]
    }],
    "UserPromptSubmit": [{
      "hooks": [{ "type": "command", "command": "node <HARNESS_DIR>/hooks/user-prompt-submit.mjs" }]
    }]
  }
}
```

Hook은 현재 작업 디렉터리의 `artifacts/`에서 활성 과제를 찾습니다. CLI도 과제 프로젝트 루트에서 실행하거나 `CODYSSEY_PROJECT_ROOT`를 지정하세요.

## 시작

```bash
node scripts/codyssey-harness.mjs start B1-1 --title "자기소개 웹사이트" --source-file /path/to/assignment.md
node scripts/codyssey-harness.mjs status B1-1
node scripts/codyssey-harness.mjs intent B1-1 "산출물 완료"
```

전체 명령과 승인 게이트는 `skills/codyssey-harness/SKILL.md`를 따릅니다. 발표 콘텐츠 생성은 `skills/presentation-content-generator/SKILL.md`의 스키마와 슬라이드별 검증 절차를 따릅니다.

## GitHub Pages 제출

각 과제의 `docs/<CODE>/index.html`을 Pages에 배포하고, 루트 README에는 각 발표 페이지로 직접 연결하는 표를 생성합니다. 예정 과제와 제목은 `config/upcoming-assignments.json`에서 수정할 수 있습니다. 존재하지 않는 산출물 경로는 링크만 표시하며 실제 파일은 만들지 않습니다.

```bash
node scripts/codyssey-harness.mjs github B1-1 --owner YOUR_ID --repo YOUR_REPO
node scripts/codyssey-harness.mjs publish B1-1             # 사전 점검
node scripts/codyssey-harness.mjs publish B1-1 --push      # 명시적 push
```

게시 명령은 루트 README와 현재 과제의 `docs/`, `submissions/`만 커밋 대상으로 지정합니다. 외부 저장소로 push하기 전에는 변경 사항을 확인하세요.

## 검증

```bash
npm test
```

과제 상태와 산출물은 각 사용자의 과제 저장소 `artifacts/<assignment-key>/`에 저장되며 이 하네스 저장소에는 포함하지 않습니다.
