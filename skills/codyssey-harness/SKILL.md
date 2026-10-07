---
name: codyssey-harness
description: Manage one Codyssey assignment from intake through artifact creation, presentation design, learning, export, and submission.
---

# Codyssey Harness

Use this skill when the user starts or continues a Codyssey assignment workflow. The workflow is artifact-first: do not create a practice plan or force concept learning before the final artifact exists.

For the presentation-content phase, load and follow the dedicated `$presentation-content-generator` skill. Keep this harness skill focused on phase transitions and assignment orchestration; the dedicated skill owns the render-ready content schema, slide ordering, code mapping, and embedded learning data.

## Start And Intake

When invoked without an active new-harness assignment:

1. Ask for the assignment number first, one question at a time.
2. As soon as the number is known, rename the current Codex task to that number with `set_thread_title`.
   - Example: `B1-1`
   - Use only the assignment number, never the assignment title.
3. Ask for the assignment title, allowing blank/automatic handling.
4. Ask for the complete assignment content, accepting pasted text or a file path.
5. Ask whether a separate evaluation checklist exists, then accept pasted text or a file path. If none exists, keep the checklist source empty; do not invent a supplied checklist.
6. Preserve the original content verbatim as `assignment/source.md` and the supplied checklist as `assignment/checklist.md`. For pasted content, stage temporary input files outside the assignment, run `start`, then remove those staging files.
7. Analyze both documents semantically and create a requirements-definition JSON draft through `save-requirements`. Do not extract only bullet lines. Split compound requirements into independently verifiable items, merge only true duplicates, keep conflicts/ambiguities visible, and cite exact source excerpts for every item.
8. Each requirement item includes: title, category (`functional`, `quality`, `technical`, `delivery`, `bonus`, `constraint`), scope (`required` or `optional`), inclusion (`true` for required; user-selected `true`/`false` for optional, initially `null`), plain-language description, observable acceptance criteria, source references, and verification method (`static`, `runtime`, `visual`, `manual`, `delivery`).
9. Before presenting the draft, reread the complete source and checklist once. Check that each mandatory and optional requirement is represented in an acceptance criterion, and that the draft adds no unsupported criteria. Keep unresolved wording visible instead of guessing.
10. Present the draft grouped by required and optional items, including unresolved ambiguities. Ask the user to correct it and choose which optional items to include. Save revisions as drafts. Do not infer missing requirements or resolve contradictions silently.
11. After showing the complete draft, run `request-requirements-approval`. Ask the confirmation question returned by the harness. The user only needs to answer that question; do not require a special phrase. If they request edits, revise and save the draft, show the updated version, and ask again. Only a clear affirmative should approve the requirements and enter `artifact`.

### Requirements Granularity

- Organize the definition as a manageable set of top-level requirements grouped by deliverable area or user-facing capability. Aim for roughly 15-25 top-level items for a typical assignment, but treat this as a calibration target, not a quota.
- A top-level item should describe a meaningful outcome or constraint that can be reviewed as one coherent unit. Put its detailed, independently checkable acceptance criteria underneath it instead of promoting every criterion into another top-level requirement.
- Keep closely related behavior together: for example, form fields, validation, nearby error feedback, and submit success belong under one form requirement; loading/success/error/empty/retry belong under one API-state requirement.
- Do not create separate top-level requirements for each syntax token or implementation detail when they jointly serve one capability. Group required JavaScript conventions together, while retaining each mandated convention as a sub-check. Keep a technique separate only when the assignment evaluates it as an independent learning outcome or constraint.
- Split a requirement into separate top-level items when its outcomes can be independently included, excluded, approved, or delivered, or when combining them would obscure whether one is complete. Never merge unrelated requirements merely to hit the target count.
- Preserve traceability: every top-level requirement must cite one or more exact excerpts from the supplied source/checklist, and each acceptance criterion must be grounded in that requirement. Keep recommendations, examples, and optional suggestions distinct from mandatory criteria.
- Do not invent thresholds, device sizes, content, identities, or pass conditions where the source is vague. Record the ambiguity and ask only if its answer affects scope or acceptance; otherwise retain it as an explicit unresolved note.
- In the user-facing draft, make hierarchy visible: requirement ID/title, short intent, indented acceptance checks, source evidence, and verification method. These acceptance checks are the progress checklist: store status and evidence on each check, then derive the parent requirement status from its checks. Do not create a second generated checklist document. Group optional bonus items separately and leave inclusion undecided until the user chooses.

The harness root is the cloned `codyssey-harness` directory; the project root is the user's active assignment repository. Keep all assignment-specific work under `artifacts/<assignment-key>/`; never mix it with another assignment.

## Phase Rules

### Intake

Do not begin final-artifact work until the requirement definition is non-empty, every optional item has an inclusion decision, and the user has confirmed it. Preserve the raw assignment and any supplied evaluation checklist unchanged. The structured definition is the single source of truth for acceptance checks, progress status, and evidence; do not create a duplicate generated checklist.

### Artifact

Collaborate freely with the user and build the final deliverable first. Do not invent practice logs. When the user says `산출물 완료`, verify every included acceptance check against the artifact, record evidence for each check in the requirements definition, and run `validate`. Request the artifact-to-analysis transition only after validation passes; the harness blocks it if any included check is not fulfilled or its evidence file is missing.

### Analyze

Analyze the assignment requirements first and design the presentation narrative around what each requirement needs to communicate, not around the code map. A chapter/theme may use code, terminal command/output, screenshot, or explanatory text; choose only the forms that help explain the requirement. Do not force code, terminal, or screenshot slides when they add no value. Before adding a terminal log slide, ask the user whether terminal output should be included; never execute a command just to manufacture presentation evidence. Record evidence only when it actually exists.

Use this presentation hierarchy consistently: a chapter is one top-level requirement from the approved requirements definition, a theme is one coherent explanation group derived from that requirement's acceptance criteria, and a slide is one understandable explanation unit within that theme. Default to one chapter per included top-level requirement so the assignment's structure remains visible and traceable. Do not create one theme per acceptance criterion mechanically; group closely related criteria when they share the same implementation flow, evidence path, and takeaway. Split themes when criteria answer independent questions, use different evidence, or would become overloaded together. The number of themes should come from the acceptance criteria and narrative needs, not from a fixed slide target.

Before saving the narrative plan, build an internal coverage matrix from every included requirement and every acceptance-criterion ID to one or more chapter/theme IDs. The matrix is a planning check, not a code map: it must show where all criteria will be explained, while allowing several criteria to share one theme. A plan is not ready if an included requirement or criterion has no chapter/theme destination, even when the implementation exists. Preserve required, bonus, and deployment scope, and keep the requirement IDs available for the later presentation-content links.

Theme-count guidance: do not require two or more themes per chapter and do not pad a chapter with artificial subdivisions. One theme is valid when the criteria form one coherent question or implementation flow. Use multiple themes only when the criteria have independent questions, implementation flows, evidence paths, or learning takeaways. Several criteria may share one theme, and one criterion may be referenced by multiple themes only when those themes explain genuinely different implementation perspectives. Every theme must state its criterion IDs, takeaway, explanation boundary, result, and evidence direction; theme count is determined by meaning, not symmetry or a target number.

Treat included bonus requirements as their own requirement chapters, placed after the required chapters, and explain their added value and implementation choices. Excluded optional requirements must not receive a chapter or theme. Deployment and submission requirements also remain their own requirement chapters when present; do not hide them inside a generic closing chapter.

Keep required, bonus, and deployment scope separate in the presentation plan. Each chapter must declare the single top-level `requirementId` it represents and an explicit `kind` such as `core`, `bonus`, or `deployment`; validate that the chapter's kind matches the requirement scope. Themes may reference the chapter's acceptance-criterion IDs in the planning record, but must not silently absorb criteria from another requirement. A bonus requirement needs at least one dedicated implementation-focused theme and later at least one implementation slide. Do not create separate verification slides.

    Design in conversation in this order: show the included top-level requirements as the proposed chapter list, then propose each chapter's themes with the acceptance-criterion IDs covered by each theme, takeaway, and rationale. The chat proposal is not complete until the exact user-agreed structure and coverage matrix are written to `analysis/presentation-plan.json` through `save-analysis --plan-file`. After saving, show the persisted chapter/theme IDs and the criterion coverage back to the user; the displayed proposal and persisted JSON must match before requesting presentation-design approval. Analysis records the narrative and criterion coverage only; it must not create a theme-level code map or commit to exact slide count, file ranges, screenshots, commands, or final slide order. After the narrative is approved, presentation-content generation proceeds in chapter/theme or slide-sized batches. For each agreed slide, choose its modality, exact source, code range, requirement links, and explanation, then check it against earlier slides for overlap or duplication. Do not silently synthesize the entire deck.

    The presentation plan is narrative input only. In presentation-content, first create an implementation inventory, then a `slideBlueprint` that maps each theme to one or more slides, then generate the ordered root `slides[]`. The renderer emits exactly one slide per saved content item and must not invent, split, or reorder slides. Generate and validate one slide at a time with `validate-slide` and `append-slide`; do not bulk-synthesize or bulk-append a deck. Content slide types are `code`, `terminal`, `image`, or `text`, and each cites the owning `requirementIds` plus the covered criterion IDs when applicable. Code slides use an exact artifact-relative file and one or more precise slide-level code regions created during content generation. A code region should have one owning slide; reuse requires an explicit summary/comparison reason. For every implementation feature, identify all relevant HTML, CSS, and JavaScript files before creating slides; create separate file-specific code slides and connect them with one `implementationId`. The final `content.codeMap` is derived from those slide regions and is the only canonical code map. Each code slide must also include an embedded `learning` object: `learning.concepts[]` explains the relevant syntax/functions, and `learning.codeBlocks[]` maps exact line ranges inside the slide region to detailed bullet explanations. Code blocks must be semantic, not midpoint or line-count splits. These explanations are rendered inside the slide's help modal; do not create a separate learning page. Every included requirement and criterion must be covered before content approval.

Do not create verification slides. When verification is required by the assignment, show the actual result in the relevant code, terminal, or image slide and retain the requirement's verification metadata only for artifact validation.

The requirements definition must distinguish `verificationRequired` from `verificationMethod`; a method alone does not authorize a presentation verification slide. Presentation content may declare `implementations[]` with an `id`, `requiredFiles[]`, and `slideIds[]`. When declared, the harness requires every listed file to have its own code slide, and assigns the shared `implementationId` to those slides.

For every included requirement, determine whether implementation is found, not found, mismatched, or uncertain. Record only actual implementation findings (`not-found`, `mismatch`, `uncertain`) in `code-map.findings`, with a concise reason and code evidence. Do not infer that implementation is absent merely because a requirement has not yet been mapped. Any active implementation finding returns the assignment to `artifact`, invalidates the previous validation result, and requires fixes plus fresh validation before analysis can resume.

Keep analysis-record and presentation-design gaps separate from artifact findings. If the agent has not completed an implementation trace or has not yet covered a requirement with a presentation slide, stay in `analyze`; report it as an analysis/planning gap and inspect or revise the relevant record. A non-code slide can cover a requirement without linking to a code region. Do not infer that implementation is missing merely because the map is incomplete, and do not send the user back to artifact for an outline omission.

For each requirement trace that uses code, ask whether its selected regions explain the behavior from trigger/input to processing/state changes and user-visible output, including relevant supporting dependencies and error/empty paths when that requirement calls for them. Do not force inapplicable layers or include neighboring code without a reason. State the boundary rationale so the user can see why the map is neither a token-level excerpt nor an unnecessarily broad file dump. When code is not the useful explanation medium, keep the trace's region list empty and state the actual non-code boundary instead.

Make each presentation theme a coherent explanation unit: state its takeaway, explain why it matters, define relevant concepts in plain language (an empty list is fine when none are needed), describe the result, and cite evidence. Do not impose a fixed maximum or target number of code slides per theme. Instead, make each code slide answer one understandable code question or show one meaningful behavior, and split a long code explanation only when the slide would otherwise become overloaded. Keep related code slides in the same theme when they support one central message; split the theme only when it contains genuinely independent questions or takeaways. Its ordered slides may mix modalities when useful; code slides read their regions from the artifact using file and line range and apply syntax highlighting. Every included requirement must appear in at least one slide. Approval is blocked until no implementation findings or planning gaps remain. Then present the code map and chapter/theme/slide proposal for user feedback.

The presentation-design phase creates only narrative chapters, themes, and criterion coverage. Actual files, code ranges, commands, images, slide numbers, and learning content belong to the later slide-by-slide content phase.

### Presentation And Learning

Render the presentation and README only from the completed self-contained `presentation-content.json` after every slide has passed slide-level validation. After the presentation exists, teach only the concepts already attached to its code slides. Do not create a separate learning page.

### Submission

When the user says `제출해줘`, run validation, export, and README table updates. The repository README is the only assignment index; do not create or maintain a separate GitHub Pages hub page. Each README presentation link must point directly to the configured GitHub Pages presentation URL for that assignment. Before an explicit `publish --push`, regenerate the README table and verify it includes the current assignment. `publish --push` itself must regenerate the README table immediately before staging, then commit only the root README and the current assignment's `docs/<CODE>/` and `submissions/<CODE>/` paths. Do not include unrelated staged or working-tree changes. Keep GitHub Pages enabled to host presentation files under `/docs`, but do not publish an extra catalog page at the Pages root. Configure GitHub only when needed. Treat `publish --push` as an external mutation and run it only when the user explicitly requests publishing/pushing. After a push, verify the configured current presentation URL responds successfully; a successful Git push alone is not proof that Pages finished deploying.

### Interactive Presentation Content

After the presentation design is approved, the agent owns the next action: inspect the assignment, artifact, and available evidence, then create presentation content interactively with the user in chapter/theme or slide-sized batches. Show each batch's title, modality, source code/image/command/result, and explanation, then incorporate feedback before continuing. Never silently synthesize all slide content in one pass. Prefer `code` slides with real artifact regions for implementation behavior, and use `terminal` or `image` slides when they provide stronger evidence. Every slide must have a visible title and complete type-specific content. The harness transition response exposes this as `nextAction`; follow it directly and use `save-presentation-content` only after the agent has authored and checked the content.

Within a presentation-content run, continue automatically only through the current slide's inspection and validation. Append one validated slide, then select the next blueprint entry. Never skip the slide-level validation gate or replace it with a full-deck bulk save.

Use the same auto-continue rule for other local workflow steps: once a phase's approval gate has been satisfied, execute its internal inspection, generation, validation, and file-writing steps continuously. Keep confirmation gates only for requirements approval, presentation design approval when the narrative is materially user-owned, and external actions such as publishing, pushing, or submitting.

For one feature implemented across HTML, CSS, and JavaScript, create separate code slides for each relevant file, linked by the same `implementationId`, and state each file's role. A code slide renders one file so syntax highlighting and line ranges remain precise; never use a JS-only representative slide when the feature also needs HTML or CSS. The agent must flag a missing required layer instead of silently omitting it. The renderer must visibly print the saved slide title; a missing title is a content validation error, not a styling choice.

### Screenshot Requests

Request screenshots from the user as required deliverables only when the supplied assignment source or checklist explicitly requires those screenshots. Distinguish screenshot requirements from functional requirements that merely say a state must be visible in the UI. For non-required presentation enhancement, offer screenshots as optional suggestions and provide a code or terminal alternative; do not block artifact completion or presentation progress on optional captures.

## Commands

Use the existing CLI for deterministic operations:

```bash
node <HARNESS_DIR>/scripts/codyssey-harness.mjs <command> ...
```

Useful commands include `start`, `status`, `requirements`, `save-requirements`, `request-requirements-approval`, `validate`, `save-analysis --plan-file`, `save-presentation-content --content-file`, `render`, `export`, `hub`, `github`, `publish`, and `intent`. `save-analysis` accepts only the narrative plan; it must not receive a code-map file.

When a phase-completion phrase is detected, the CLI first returns a confirmation prompt and persists a pending transition; it does not move phases yet. Ask that exact question and send the user's next clear affirmative/negative reply through `intent` again. A negative cancels; an unrelated reply dismisses the pending confirmation and is handled as ordinary input. For intake, after the requirements draft has been presented, run `request-requirements-approval`; a clear affirmative approves it and advances to `artifact`, while edits return to draft review. For `발표 설계 완료`, only the affirmative confirmation marks the plan approved and advances the phase. If the user gives presentation-plan feedback before rendering, save the revised analysis; this reopens `analyze`, resets approval to draft, and requires approval again.

After every state-changing command, inspect its output and report the resulting phase and next action. Treat non-zero exit codes as failures, even when stdout contains JSON. Never claim that a file was rendered, exported, or published without checking the command result and expected path.
