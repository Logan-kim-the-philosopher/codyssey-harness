---
name: presentation-content-generator
description: Create and validate Codyssey presentation-content.json after an approved presentation design exists; use for final slide content, code mapping, learning explanations, and render-ready ordering.
---

# Presentation Content Generator

Use this skill after the narrative presentation design has been approved. Produce one self-contained `presentation-content.json` that the renderer can consume without consulting the presentation plan.

## Required Output

The root object must contain:

- `version`: `1`
- `status`: `complete` only after validation
- `chapters`: copied from the approved design, including every chapter and theme's narrative fields
- `slideBlueprint`: the approved theme-to-slide decomposition, with one or more slide records per theme
- `slides`: the final ordered slide list
- `codeMap`: `{ version: 1, regions: [], requirementTraces: [], findings: [] }`
- optional `implementations`

Read [references/schema.md](references/schema.md) for the complete slide-type contract.

## Workflow

1. Read the approved presentation plan, requirements, and artifact files. Treat the plan as input, not as renderer data.
2. Inspect the artifact directly. Do not invent files, code ranges, screenshots, commands, or implementation claims.
3. Build a `slideBlueprint` before writing slide content. A theme is an explanation scope, not a slide: decompose each theme into as many slides as its implementation requires. A feature spanning HTML, CSS, JavaScript, Firebase, and a result may produce several slides.
4. Build `chapters`, `themes`, `slideBlueprint`, and `implementationInventory` into a draft content file with **only the first cover slide**.
5. Generate the remaining slides strictly one at a time: write one temporary slide JSON, run `validate-slide`, then run `append-slide`. Never pre-generate a complete slides array, copy a complete content file into the harness location, or use `save-presentation-content` to add multiple slides at once.
6. Build slides in final presentation order from the blueprint. Put the cover first, then each chapter cover immediately before that chapter's content. Assign a unique sequential `slideNumber` starting at 1.
7. Use only supported slide types: `cover`, `chapter-cover`, `code`, `terminal`, `image`, and `text`.
8. Give every non-cover slide its `chapterId`, `themeId`, `requirementIds`, and applicable `criterionIds`.
9. For code slides, show one artifact-relative file, create precise non-overlapping regions, and add matching `codeMap.regions`. Keep one owning slide per region unless an explicit comparison/reuse reason is recorded.
10. Add embedded `learning.purpose` and `learning.codeBlocks` to every code slide. `learning.purpose` is one concise, intuitive statement describing what the slide's code blocks collectively accomplish; derive it from the whole slide's selected code, not one block, and do not repeat the detailed walkthrough. Treat `codeBlocks` as a guided code review, not a summary of the whole highlighted region:
   - Split each region into semantic units such as imports/dependencies, declaration, input/props, state initialization, event handler, async request, success/error branch, transformation, and rendered output. Within each unit, explain one function, statement, JSX element, expression, or closely bound syntax group in source order. Never use one block for an entire file or a large region merely because it fits on one slide.
   - Use exact, non-overlapping line ranges inside the slide region. Prefer one responsibility per block and split long functions at meaningful control-flow boundaries rather than arbitrary line counts.
   - Give every range a variable-length `details` array. Do not target a fixed bullet count: add as many details as the code needs and no filler details for simple code. Write the details as a guided reading of the code in source order, not as a high-level summary.
   - Read every language using the same general code-reading principle rather than a language-specific checklist. Select only the constructs that are meaningful in the selected source: identify what receives input, what transforms or stores it, what side effect or output it produces, and what the next construct consumes. Adapt the vocabulary to the language, but keep the explanation centered on execution flow and data flow.
   - Explain unfamiliar syntax or APIs fully at their first meaningful appearance. When the same syntax or API appears later, do not repeat its definition, copy a template sentence, or mention explanation history. Describe only its new local role, input, output, or data flow in natural prose.
   - Connect adjacent details so the reader can follow execution from imported dependency to state, event, request, transformation, and rendered result. Use real identifiers, function names, values, and API names from the artifact. Never infer behavior that is not supported by the selected source lines.
   - Avoid generic filler such as “이 코드는 기능을 구현합니다”, “다음 단계로 연결됩니다”, or “화면을 업데이트합니다” without naming the exact value, operation, or rendered element involved.
   - Generate the slide-level `learning.purpose` only after considering all code regions and code blocks on that slide. It should help the reader understand the overall intent at a glance; it must not describe an individual region/block or introduce behavior unsupported by the source.
   - Generate explanations with this exact range-first procedure before appending a code slide:
     1. Resolve the slide's `regionIds` to the artifact file and exact line range.
     2. Read only the source lines covered by the slide region and its `codeBlocks.lines`; do not explain unrelated lines from the same file.
     3. Walk the selected source in order and identify meaningful elements before writing prose.
     4. Identify the source language only to interpret its syntax correctly. Do not switch to a predefined language checklist. Let the selected code determine which constructs deserve explanation, whether the code is JavaScript, JSX, Python, CSS, HTML, JSON, configuration, or another supported language.
     5. Write a variable-length detail for each element that is needed to understand the selected range. Do not force unrelated elements into a shared bullet.
     6. Consult the ordered explanation ledger from earlier slides. Fully define a syntax/API only at its first meaningful appearance; later uses explain their local role and data flow without repeating the definition or mentioning the ledger.
     7. Run a coverage pass: every meaningful element in the selected range must be explained or explicitly classified as non-explanatory punctuation, formatting, or repeated syntax. Remove any generic filler and any claim unsupported by the source.
   - Explain unfamiliar syntax and APIs inside the relevant code-block details. Explain the relationship between adjacent blocks so the reader can reconstruct the feature from top to bottom.
   - Track syntax and API explanations in presentation order. Explain an element fully at its first meaningful appearance; when the same element appears again, do not repeat its definition or mention the explanation history. Describe only its current role, inputs, outputs, and changed data in natural prose.
   - Start each detail from the concrete code element, not from the block. Never begin with `이 구간은`, `이 블록은`, `이 코드는`, `이 파일은`, `아래에서`, or `다음 단계로 연결됩니다`. Name the identifier, expression, selector, tag, value, or API immediately.
   - Do not mechanically introduce every import with the same sentence. Explain the module purpose once, then group related named imports naturally. Distinguish UI components, hooks, router primitives, Firebase APIs, utilities, values, and style side effects.
   - Avoid repeated scaffolding such as `이 구간`, `이름 공간`, `아래`, `실제 동작`, and `담당합니다`. Replace them with the concrete value, caller, state, route, database operation, or rendered element involved.
   - Read each block's details as continuous prose before validation. Merge adjacent bullets when they explain the same element, and rewrite repeated definitions around the later element's local input, output, or data flow.
   - Use a code-reading translation mode. Walk the meaningful tokens and syntax from left to right and explain each one in context: what the token or construct means in the language, what role it plays here, what value it receives or produces, and how it changes the meaning of the surrounding expression. Do not replace this reading with a single summary sentence.
   - For a compound expression, move from the outside structure to its parts and back to the whole: identify the call or declaration, then its names, operators, arguments, attributes, nested expressions, and returned value. Explain the combined result after the parts are understood.
   - Include every execution-relevant element in the selected block. Omit only whitespace, punctuation with no independent meaning, and repeated syntax whose role has already been established. A block with several meaningful tokens must contain several connected details unless one sentence genuinely explains them without loss.
   - Each detail should answer both “무엇인가?” and “여기서는 무엇을 하는가?”. Prefer concrete wording such as “`item.id`에서 고유 ID를 읽어 목록 식별자로 사용한다” over broad wording such as “데이터를 처리한다”.
   - Before appending a code slide, perform a line-by-line review of the selected region: every important statement must belong to a semantic block or be intentionally marked as supporting syntax in a neighboring block. If one block contains multiple independent responsibilities, split it before validation.
   - Generate code explanations one slide at a time, in final slide order. For each code slide, read only that slide's source ranges, write one slide-level `learning.purpose`, generate and review all of its `codeBlocks.details`, validate the slide, and persist the updated content before moving to the next slide. Never build or save explanations for all code slides as one uncheckpointed batch. If a run is interrupted, resume from the next unfinished slide.
   - The agent must author every `details` bullet from the selected source. Do not call or create rule-based explanation generators, keyword-to-sentence maps, fallback prose templates, or post-processors that invent explanation bullets. Supporting scripts may validate, persist, or render agent-authored details only.
11. Use terminal or image slides for actual evidence and results. Do not create separate verification or learning-only slides.
12. Validate each slide before appending it. After the final append, validate the complete JSON and only then mark it `complete`.

## Explanation-only Refresh

When the user asks to improve or regenerate code explanations in an existing deck, update the existing code slides' `learning` data only. Do not create, append, reorder, or renumber slides, and do not regenerate non-code slide content. Use `<HARNESS_DIR>/scripts/run-code-explanations-agent.mjs <assignment-code> --parallel 4` to process existing code slides in parallel; use `--purpose-only` to add/update only each slide-level `learning.purpose` while preserving its `codeBlocks`. Each agent handles one existing code slide; the orchestrator validates its line ranges and saves to the matching slide ID. Verify that slide IDs, order, total count, and non-code slides remain unchanged. Render only after full content validation succeeds.

## Renderer Boundary

The renderer must only read this completed content file and render its `slides` array in order. Do not rely on renderer-side sorting, inference, slide creation, plan merging, or missing-field repair. If content is incomplete, fix the content and keep `status` out of `complete`.

## Saving

Use `save-presentation-content --content-file` only for the initial one-slide draft and the final completed file. All intermediate slides must be added with `validate-slide` followed by `append-slide`. Report the saved path, slide count, chapter count, and any remaining validation gap.
