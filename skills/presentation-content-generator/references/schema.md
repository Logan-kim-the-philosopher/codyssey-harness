# Presentation Content Schema

## Root

```json
{
  "version": 1,
  "status": "complete",
  "chapters": [],
  "slideBlueprint": [],
  "slides": [],
  "codeMap": {
    "version": 1,
    "regions": [],
    "requirementTraces": [],
    "findings": []
  },
  "implementations": []
}
```

## Slide Blueprint

The blueprint is the bridge between themes and final slides. It is not a one-to-one copy of themes.

```json
[
  {
    "id": "bp-th-05-01",
    "chapterId": "ch-05",
    "themeId": "th-05-01",
    "purpose": "Firebase 원격 조회 흐름을 파일별로 설명한다.",
    "slides": [
      {
        "id": "code-firebase-config",
        "type": "code",
        "title": "Firebase 초기화",
        "source": "src/lib/firebase.js",
        "role": "서비스 초기화와 SDK 연결"
      },
      {
        "id": "code-store-query",
        "type": "code",
        "title": "Firestore 목록 조회",
        "source": "src/lib/store.js",
        "role": "사용자별 원격 데이터 조회"
      }
    ]
  }
]
```

Every included theme must have at least one blueprint slide. A theme may have many blueprint slides when a feature spans multiple files, implementation stages, or evidence types.

## Common Slide Fields

Every slide requires `id`, `slideNumber`, `type`, and `title`. `slideNumber` is a unique positive integer and defines the visible number; the array order defines navigation order.

Content slides also require `chapterId`, `themeId`, `requirementIds`, and `criterionIds` when applicable.

## Slide Types

### cover

Requires `chapterIds`; may include `subtitle`.

### chapter-cover

Requires `chapterId` and `requirementIds`.

### code

Requires `file` and `regionIds`. The file must be one artifact file. `learning.codeBlocks[]` is required. Each `regionId` must resolve to `codeMap.regions`.

Each `learning.codeBlocks[]` entry is one code-reading range. Its `lines` range must be exact and non-overlapping within the slide region. `details` has variable length: it follows the source order and explains each meaningful element needed to understand the range, without a fixed minimum or filler bullets. Explain syntax and APIs fully on first meaningful appearance; later occurrences should describe only their local role and data flow without repetitive meta-language. Split mixed responsibilities such as imports, state, handlers, async branches, transformations, and rendered output into separate ranges when doing so improves the reading flow.

Content generation must be range-first: resolve `regionIds`, read only the selected artifact lines, identify meaningful constructs in source order, and explain them through execution flow and data flow. Use the source language only to interpret syntax correctly; do not apply a predefined checklist for JavaScript, JSX, Python, CSS, HTML, JSON, or any other language. Explain what receives input, what transforms or stores it, what side effect or output it produces, and what the next construct consumes. Details must start from concrete identifiers or syntax, never from repeated openings such as `이 구간은`, `이 블록은`, `이 코드는`, or `이 파일은`. Explain an unfamiliar construct when it first matters, describe later uses through their local role, and remove identical sentence openings, vague transitions, and unsupported generic claims in a final natural-language pass. The renderer must never infer these explanations from the full file.
Code review uses a translation-like reading mode: walk meaningful tokens and syntax from left to right, explain what each means in the language and what it does in this exact expression, then explain how the parts combine. Include names, operators, arguments, attributes, nested expressions, values, and outputs when they affect execution, data flow, or rendered result. Omit only whitespace, punctuation with no independent meaning, and already-established repeated syntax. Do not replace a compound block with one broad summary sentence.

### terminal

Requires `command` and string `output`.

### image

Requires artifact-relative `src` and `alt`; may include `caption`.

### text

Requires string `body`.

## Code Region

```json
{
  "id": "r-main",
  "slideId": "code-main",
  "file": "src/main.jsx",
  "lineStart": 1,
  "lineEnd": 24,
  "title": "라우터와 레이아웃",
  "summary": "앱의 라우팅과 공통 레이아웃을 연결한다.",
  "requirementIds": ["REQ-001"],
  "criterionIds": ["REQ-001-C01"],
  "implementationId": "impl-app-shell"
}
```
