#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assignmentPaths, ensureAssignmentDirs, loadState, relativePaths, saveState } from '../src/storage.mjs';
import { requestTransition, routeMessage } from '../src/phase-machine.mjs';
import { loadRequirements, saveRequirementsDraft } from '../src/requirements.mjs';
import { validateAssignment } from '../src/validation.mjs';
import { saveAnalysis } from '../src/analysis.mjs';
import { renderAssignment } from '../src/render.mjs';
import { exportAssignment } from '../src/export.mjs';
import { renderHub } from '../src/hub.mjs';
import { configureGithub, publish, publishPreflight } from '../src/publish.mjs';

const args = process.argv.slice(2);
const command = args[0];
const code = args[1];
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const usage = 'Usage: codyssey-harness <start|status|agent-task|consume-agent-task|requirements|save-requirements|request-requirements-approval|validate|save-analysis|validate-slide|append-slide|save-presentation-content|render|export|hub|github|publish|intent> <assignment-code> ...';

function fail(message) { console.error(message); process.exitCode = 1; }

try {
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(usage);
  } else if (command === 'start' && (code === '--help' || code === '-h' || code === 'help')) {
    console.log('Usage: start <assignment-code> --title <title>');
  } else if (command === 'start') {
    if (!code || code.startsWith('-')) throw new Error('Usage: start <assignment-code> --title <title>');
    const paths = assignmentPaths(code);
    ensureAssignmentDirs(paths);
    if (existsSync(paths.stateFile)) throw new Error(`Assignment already exists: ${code}`);
    const state = { version: 1, code, title: option('--title', code), phase: 'intake', paths: relativePaths(code), requirements: { sourceFile: 'assignment/source.md', checklistFile: 'assignment/checklist.md', status: 'empty', items: [] }, validation: { status: 'not-run' }, history: [{ event: 'created', at: new Date().toISOString() }] };
    saveState(state);
    const sourceFile = option('--source-file');
    const checklistFile = option('--checklist-file');
    writeFileSync(`${paths.assignmentDir}/source.md`, sourceFile ? readFileSync(sourceFile) : '', 'utf8');
    writeFileSync(`${paths.assignmentDir}/checklist.md`, checklistFile ? readFileSync(checklistFile) : '', 'utf8');
    // A restart must not erase an existing requirements definition.
    if (!existsSync(paths.requirementsFile)) writeFileSync(paths.requirementsFile, '{\n  "items": []\n}\n', 'utf8');
    console.log(JSON.stringify({ ok: true, code, phase: state.phase, root: paths.assignmentRoot }, null, 2));
  } else if (command === 'status') {
    console.log(JSON.stringify(loadState(code), null, 2));
  } else if (command === 'agent-task') {
    const state = loadState(code);
    if (!state.agentTask || state.agentTask.status !== 'queued') {
      console.log(JSON.stringify({ ok: true, status: 'empty', phase: state.phase }, null, 2));
    } else {
      console.log(JSON.stringify({ ok: true, ...state.agentTask }, null, 2));
    }
  } else if (command === 'consume-agent-task') {
    const state = loadState(code);
    if (!state.agentTask || state.agentTask.status !== 'queued') {
      console.log(JSON.stringify({ ok: true, status: 'empty', phase: state.phase }, null, 2));
    } else {
      const task = state.agentTask;
      state.agentTask = { ...task, status: 'running', startedAt: new Date().toISOString() };
      state.history = [...(state.history || []), { event: 'agent-task-started', phase: task.phase, at: state.agentTask.startedAt }];
      saveState(state);
      const executable = process.env.CODyssey_AGENT_COMMAND || 'codex';
      const commandArgs = executable === 'codex' ? ['exec', '-C', assignmentPaths(code).assignmentRoot, '-s', 'danger-full-access', task.prompt] : [];
      const result = spawnSync(executable, commandArgs, { cwd: assignmentPaths(code).assignmentRoot, stdio: 'inherit', env: process.env });
      const current = loadState(code);
      const succeeded = result.status === 0;
      current.agentTask = { ...task, status: succeeded ? 'completed' : 'failed', ...(succeeded ? { completedAt: new Date().toISOString() } : { failedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal || null }) };
      current.history = [...(current.history || []), { event: succeeded ? 'agent-task-completed' : 'agent-task-failed', phase: task.phase, at: new Date().toISOString(), exitCode: result.status }];
      saveState(current);
      console.log(JSON.stringify({ ok: succeeded, ...current.agentTask }, null, 2));
      if (!succeeded) process.exitCode = 1;
    }
  } else if (command === 'requirements') {
    console.log(JSON.stringify(loadRequirements(code), null, 2));
  } else if (command === 'save-requirements') {
    const requirementsFile = option('--requirements-file');
    if (!requirementsFile) throw new Error('Usage: save-requirements <assignment-code> --requirements-file <json-file>');
    console.log(JSON.stringify(saveRequirementsDraft(code, JSON.parse(readFileSync(requirementsFile, 'utf8'))), null, 2));
  } else if (command === 'request-requirements-approval') {
    const result = requestTransition(code, 'requirements-approved');
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'validate') {
    const result = validateAssignment(code);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'passed') process.exitCode = 1;
  } else if (command === 'save-analysis') {
    const planFile = option('--plan-file');
    if (!planFile) throw new Error('Usage: save-analysis <assignment-code> --plan-file <file>');
    const result = saveAnalysis(code, {}, JSON.parse(readFileSync(planFile, 'utf8')));
    console.log(JSON.stringify({ ...result, savedNarrative: result.presentationPlan.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, themeIds: (chapter.themes || []).map((theme) => theme.id), themes: (chapter.themes || []).map((theme) => theme.title) })) }, null, 2));
  } else if (command === 'validate-slide') {
    const slideFile = option('--slide-file');
    if (!slideFile) throw new Error('Usage: validate-slide <assignment-code> --slide-file <file>');
    const paths = assignmentPaths(code);
    const slide = JSON.parse(readFileSync(slideFile, 'utf8'));
    const content = JSON.parse(readFileSync(paths.presentationContentFile, 'utf8'));
    const ids = new Set((content.slides || []).map((entry) => entry.id));
    if (!slide.id || ids.has(slide.id)) throw new Error(`Slide ID is missing or already exists: ${slide.id || '(missing)'}`);
    const expectedNumber = (content.slides || []).length + 1;
    if (slide.slideNumber !== expectedNumber) throw new Error(`Expected slideNumber ${expectedNumber}, received ${slide.slideNumber}.`);
    if (!slide.type || !slide.title) throw new Error('Slide requires type and title.');
    if (!['cover', 'chapter-cover', 'code', 'terminal', 'image', 'text'].includes(slide.type)) throw new Error(`Unsupported slide type: ${slide.type}`);
    if (!['cover', 'chapter-cover'].includes(slide.type) && (!slide.chapterId || !slide.themeId)) throw new Error('Content slides require chapterId and themeId.');
    const chapterIds = new Set((content.chapters || []).map((chapter) => chapter.id));
    const themeIds = new Set((content.chapters || []).flatMap((chapter) => (chapter.themes || []).map((theme) => `${chapter.id}:${theme.id}`)));
    if (!['cover', 'chapter-cover'].includes(slide.type) && (!chapterIds.has(slide.chapterId) || !themeIds.has(`${slide.chapterId}:${slide.themeId}`))) throw new Error('Slide references an unknown chapterId or themeId.');
    const blueprintSlideIds = new Set((content.slideBlueprint || []).flatMap((entry) => (entry.slides || []).map((entrySlide) => entrySlide.id)));
    if (!['cover', 'chapter-cover'].includes(slide.type) && !blueprintSlideIds.has(slide.id)) throw new Error(`Slide ${slide.id} is not declared in slideBlueprint.`);
    if (slide.type === 'code' && (!slide.file || !Array.isArray(slide.regionIds) || !slide.regionIds.length || !slide.learning || typeof slide.learning.purpose !== 'string' || !slide.learning.purpose.trim())) throw new Error('Code slide requires file, regionIds, and learning.purpose.');
    if (slide.type === 'code') {
      const regions = slide.regionIds.map((id) => content.codeMap?.regions?.find((region) => region.id === id));
      if (regions.some((region) => !region)) throw new Error(`Slide ${slide.id} references an unknown code region.`);
      if (regions.some((region) => region.file !== slide.file)) throw new Error(`All regions on ${slide.id} must belong to ${slide.file}.`);
      if (!Array.isArray(slide.learning.codeBlocks) || !slide.learning.codeBlocks.length) throw new Error(`Code slide ${slide.id} needs learning.codeBlocks.`);
    }
    if (slide.type === 'terminal' && (!slide.command || typeof slide.output !== 'string')) throw new Error('Terminal slide requires command and output.');
    if (slide.type === 'image' && (!slide.src || !slide.alt)) throw new Error('Image slide requires src and alt.');
    if (slide.type === 'text' && !slide.body) throw new Error('Text slide requires body.');
    console.log(JSON.stringify({ ok: true, slideId: slide.id, slideNumber: slide.slideNumber }, null, 2));
  } else if (command === 'append-slide') {
    const slideFile = option('--slide-file');
    if (!slideFile) throw new Error('Usage: append-slide <assignment-code> --slide-file <file>');
    const paths = assignmentPaths(code);
    const content = JSON.parse(readFileSync(paths.presentationContentFile, 'utf8'));
    const slide = JSON.parse(readFileSync(slideFile, 'utf8'));
    if (content.status === 'complete' || content.status === 'approved') throw new Error('Cannot append to completed presentation content.');
    const ids = new Set((content.slides || []).map((entry) => entry.id));
    if (!slide.id || ids.has(slide.id)) throw new Error(`Slide ID is missing or already exists: ${slide.id || '(missing)'}`);
    if (slide.slideNumber !== content.slides.length + 1) throw new Error(`Expected slideNumber ${content.slides.length + 1}, received ${slide.slideNumber}.`);
    const blueprintSlideIds = new Set((content.slideBlueprint || []).flatMap((entry) => (entry.slides || []).map((entrySlide) => entrySlide.id)));
    if (blueprintSlideIds.size && !blueprintSlideIds.has(slide.id)) throw new Error(`Slide ${slide.id} is not declared in slideBlueprint.`);
    content.slides.push(slide);
    content.status = 'draft';
    writeFileSync(paths.presentationContentFile, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ok: true, file: paths.presentationContentFile, slides: content.slides.length, nextSlideNumber: content.slides.length + 1 }, null, 2));
  } else if (command === 'save-presentation-content') {
    const contentFile = option('--content-file');
    if (!contentFile) throw new Error('Usage: save-presentation-content <assignment-code> --content-file <file>');
    const paths = assignmentPaths(code);
    const content = JSON.parse(readFileSync(contentFile, 'utf8'));
    const existingContent = existsSync(paths.presentationContentFile) ? JSON.parse(readFileSync(paths.presentationContentFile, 'utf8')) : null;
    const existingCount = Array.isArray(existingContent?.slides) ? existingContent.slides.length : 0;
    if (!existingCount && content.slides.length !== 1) throw new Error('Sequential presentation generation must initialize with exactly one slide.');
    if (!existingCount && content.status !== 'draft') throw new Error('Initial presentation content must be draft and contain only the first slide. Build later slides with validate-slide and append-slide.');
    if (existingCount && content.slides.length > existingCount && content.slides.length !== existingCount + 1) throw new Error(`Sequential presentation generation allows one new slide at a time; existing=${existingCount}, incoming=${content.slides.length}. Use append-slide.`);
    const requirements = existsSync(paths.requirementsFile) ? JSON.parse(readFileSync(paths.requirementsFile, 'utf8')) : { items: [] };
    const requirementById = new Map(requirements.items.map((item) => [item.id, item]));
    const chapterById = new Map((content.chapters || []).map((chapter) => [chapter.id, chapter]));
    if (!Array.isArray(content.slides)) throw new Error('presentation-content must contain a slides array.');
    if (!Array.isArray(content.chapters) || !content.chapters.length) throw new Error('presentation-content must contain self-contained chapters.');
    if (!Array.isArray(content.slideBlueprint) || !content.slideBlueprint.length) throw new Error('presentation-content must contain slideBlueprint.');
    if (!Array.isArray(content.implementationInventory) || !content.implementationInventory.length) throw new Error('presentation-content must contain implementationInventory.');
    if (content.implementationInventory.some((entry) => !entry.id || !Array.isArray(entry.files) || !entry.files.length || entry.files.some((file) => !file.path))) throw new Error('Each implementationInventory entry needs an id and file paths.');
    if (content.status === 'blocked-material' && (!Array.isArray(content.materialBlockers) || !content.materialBlockers.length)) throw new Error('blocked-material content must include materialBlockers.');
    if (content.status === 'approved' && Array.isArray(content.materialBlockers) && content.materialBlockers.length) throw new Error('Approved presentation content cannot retain material blockers.');
    const ids = content.slides.map((slide) => slide.id);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('Presentation content slide IDs must be present and unique.');
    const slideNumbers = content.slides.map((slide) => slide.slideNumber);
    if (slideNumbers.some((number) => !Number.isInteger(number) || number < 1) || slideNumbers.some((number, index) => number !== index + 1)) throw new Error('Presentation content slideNumber values must be contiguous starting at 1.');
    const chapterIds = new Set(content.chapters.map((chapter) => chapter.id));
    const themeIds = new Set(content.chapters.flatMap((chapter) => (chapter.themes || []).map((theme) => `${chapter.id}:${theme.id}`)));
    const blueprintSlideIds = new Set(content.slideBlueprint.flatMap((entry) => (entry.slides || []).map((slide) => slide.id)));
    for (const entry of content.slideBlueprint) {
      if (!entry.id || !chapterIds.has(entry.chapterId) || !themeIds.has(`${entry.chapterId}:${entry.themeId}`) || !Array.isArray(entry.slides) || !entry.slides.length) throw new Error(`Invalid or empty slide blueprint entry: ${entry.id || '(missing)'}`);
      for (const slide of entry.slides) if (!ids.includes(slide.id)) throw new Error(`Slide blueprint ${entry.id} references unknown slide ${slide.id}.`);
    }
    if (content.slides.some((slide) => slide.type !== 'cover' && slide.type !== 'chapter-cover' && (!chapterIds.has(slide.chapterId) || !themeIds.has(`${slide.chapterId}:${slide.themeId}`)))) throw new Error('Every content slide must reference a valid chapterId and themeId.');
    if (content.slides.filter((slide) => slide.type !== 'cover' && slide.type !== 'chapter-cover').some((slide) => !blueprintSlideIds.has(slide.id))) throw new Error('Every content slide must be declared in slideBlueprint.');
    const regionOwners = new Map();
    const rangedRegions = [];
    const finalRanges = [];
    const contentRequirementIds = new Set();
    const slideById = new Map(content.slides.map((slide) => [slide.id, slide]));
    const finalRegions = content.codeMap?.regions;
    if (content.slides.some((slide) => slide.type === 'code') && !Array.isArray(finalRegions)) {
      throw new Error('Code slides require content.codeMap.regions created during presentation-content generation.');
    }
    if (Array.isArray(finalRegions)) {
      const seenRegionIds = new Set();
      for (const region of finalRegions) {
        if (!region.id || seenRegionIds.has(region.id)) throw new Error(`Final code-map region IDs must be unique: ${region.id || '(missing)'}`);
        seenRegionIds.add(region.id);
        if (!region.file || !Number.isInteger(region.lineStart) || !Number.isInteger(region.lineEnd) || region.lineStart < 1 || region.lineEnd < region.lineStart) {
          throw new Error(`Final code-map region ${region.id} needs a valid file and line range.`);
        }
        for (const previous of finalRanges) {
          if (previous.file === region.file && region.lineStart <= previous.lineEnd && previous.lineStart <= region.lineEnd) {
            throw new Error(`Final code-map region ${region.id} overlaps ${previous.id} in ${region.file}; split the range.`);
          }
        }
        finalRanges.push({ id: region.id, file: region.file, lineStart: region.lineStart, lineEnd: region.lineEnd });
      }
    }
    if (Array.isArray(content.implementations)) {
      const implementationIds = new Set();
      for (const implementation of content.implementations) {
        if (!implementation.id || implementationIds.has(implementation.id)) throw new Error(`Implementation IDs must be present and unique: ${implementation.id || '(missing)'}`);
        implementationIds.add(implementation.id);
        if (!Array.isArray(implementation.requiredFiles) || !implementation.requiredFiles.length) throw new Error(`Implementation ${implementation.id} needs requiredFiles.`);
        if (!Array.isArray(implementation.slideIds) || !implementation.slideIds.length) throw new Error(`Implementation ${implementation.id} needs slideIds.`);
        const implementationSlides = implementation.slideIds.map((id) => slideById.get(id));
        if (implementationSlides.some((slide) => !slide)) throw new Error(`Implementation ${implementation.id} references an unknown slide.`);
        const actualFiles = new Set(implementationSlides.filter((slide) => slide.type === 'code').map((slide) => slide.file));
        for (const file of implementation.requiredFiles) if (!actualFiles.has(file)) throw new Error(`Implementation ${implementation.id} is missing a code slide for ${file}.`);
        for (const slide of implementationSlides) {
          if (slide.implementationId && slide.implementationId !== implementation.id) throw new Error(`Slide ${slide.id} belongs to another implementation.`);
          slide.implementationId = implementation.id;
        }
      }
    }
    for (const slide of content.slides) {
      if (!['cover', 'chapter-cover', 'code', 'terminal', 'image', 'text'].includes(slide.type)) throw new Error(`Unsupported presentation slide type for ${slide.id}: ${slide.type}`);
      if (/^slide-\d+$/u.test(slide.id)) throw new Error(`Presentation slide ID must describe its content, not its number: ${slide.id}.`);
      if (!slide.title?.trim()) throw new Error(`Presentation content is missing a title for ${slide.id}.`);
      const referenced = (slide.requirementIds || []).map((id) => requirementById.get(id)).filter(Boolean);
      for (const item of referenced) contentRequirementIds.add(item.id);
      const chapter = chapterById.get(slide.chapterId);
      if (chapter?.kind === 'core' && referenced.some((item) => item.scope === 'optional')) throw new Error(`Core slide ${slide.id} cannot reference bonus requirements.`);
      if (chapter?.kind === 'bonus' && referenced.some((item) => item.scope !== 'optional')) throw new Error(`Bonus slide ${slide.id} cannot reference core requirements.`);
      if (slide.type === 'code' && (!slide.file || !Array.isArray(slide.regionIds) || !slide.regionIds.length)) throw new Error(`Code content is incomplete for ${slide.id}.`);
      if (slide.type === 'code') {
        if (!slide.learning || typeof slide.learning.purpose !== 'string' || !slide.learning.purpose.trim() || !Array.isArray(slide.learning.codeBlocks) || !slide.learning.codeBlocks.length) {
          throw new Error(`Code slide ${slide.id} needs learning.purpose and learning.codeBlocks.`);
        }
        const slideRegions = slide.regionIds.map((id) => content.codeMap?.regions?.find((entry) => entry.id === id)).filter(Boolean);
        const fileRanges = new Map();
        for (const block of slide.learning.codeBlocks) {
          const match = String(block.lines || '').match(/^(\d+)(?:-(\d+))?$/u);
          if (!match || !Array.isArray(block.details) || !block.details.length) throw new Error(`Learning code block is incomplete for ${slide.id}.`);
          const lineStart = Number(match[1]);
          const lineEnd = Number(match[2] || match[1]);
          if (lineEnd < lineStart) throw new Error(`Learning code block has an invalid range for ${slide.id}.`);
          const range = slideRegions.find((entry) => lineStart >= entry.lineStart && lineEnd <= entry.lineEnd);
          if (!range) throw new Error(`Learning code block ${block.lines} escapes the slide region for ${slide.id}.`);
          const previous = fileRanges.get(range.file) || [];
          if (previous.some((item) => lineStart <= item.lineEnd && item.lineStart <= lineEnd)) throw new Error(`Learning code blocks overlap for ${slide.id}.`);
          previous.push({ lineStart, lineEnd });
          fileRanges.set(range.file, previous);
        }
      }
      if (slide.type === 'terminal' && (!slide.command || typeof slide.output !== 'string')) throw new Error(`Terminal content is incomplete for ${slide.id}.`);
      if (slide.type === 'image' && (!slide.src || !slide.alt)) throw new Error(`Image content is incomplete for ${slide.id}.`);
      if (slide.type === 'text' && !slide.body) throw new Error(`Text content is incomplete for ${slide.id}.`);
      if (slide.type === 'code') {
        for (const regionId of slide.regionIds) {
          const owner = regionOwners.get(regionId);
          if (owner && !slide.allowRegionReuse) throw new Error(`Code region ${regionId} is reused by ${owner} and ${slide.id}; split the region or explicitly mark a summary reuse.`);
          regionOwners.set(regionId, slide.id);
          const region = content.codeMap?.regions?.find((entry) => entry.id === regionId);
          if (region) {
            for (const previous of rangedRegions) {
              if (previous.file === region.file && region.lineStart <= previous.lineEnd && previous.lineStart <= region.lineEnd && previous.slideId !== slide.id && !slide.allowRegionReuse) {
                throw new Error(`Code region ${regionId} overlaps ${previous.slideId} in ${region.file}; split the region or explicitly mark a summary reuse.`);
              }
            }
            rangedRegions.push({ slideId: slide.id, file: region.file, lineStart: region.lineStart, lineEnd: region.lineEnd });
          }
        }
        if (Number.isInteger(slide.lineStart) && Number.isInteger(slide.lineEnd)) {
          for (const previous of rangedRegions) {
            if (previous.file === slide.file && slide.lineStart <= previous.lineEnd && previous.lineStart <= slide.lineEnd && !slide.allowRegionReuse) {
              throw new Error(`Code range ${slide.file}:${slide.lineStart}-${slide.lineEnd} overlaps ${previous.slideId} (${previous.lineStart}-${previous.lineEnd}); split the range or explicitly mark a summary reuse.`);
            }
          }
          rangedRegions.push({ slideId: slide.id, file: slide.file, lineStart: slide.lineStart, lineEnd: slide.lineEnd });
        }
      }
    }
    const activeRequirementIds = new Set(requirements.items.filter((item) => item.scope !== 'optional' || item.included === true).map((item) => item.id));
    for (const id of activeRequirementIds) if (!contentRequirementIds.has(id)) throw new Error(`Included requirement ${id} is missing from presentation content.`);
    for (const item of requirements.items.filter((entry) => entry.scope === 'optional' && entry.included === true)) {
      const bonusSlides = content.slides.filter((slide) => (slide.requirementIds || []).includes(item.id));
      if (!bonusSlides.length) throw new Error(`Included bonus requirement ${item.id} is missing from presentation content.`);
      if (!bonusSlides.some((slide) => slide.type === 'code')) throw new Error(`Included bonus requirement ${item.id} needs an implementation code slide.`);
    }
    if (content.slides.some((slide) => !slide.chapterId && !['cover', 'chapter-cover'].includes(slide.type))) throw new Error('Every content slide needs a chapterId.');
    mkdirSync(paths.analysisDir, { recursive: true });
    writeFileSync(paths.presentationContentFile, `${JSON.stringify({ version: 1, status: content.status || 'draft', ...(content.chapters ? { chapters: content.chapters } : {}), ...(content.implementationInventory ? { implementationInventory: content.implementationInventory } : {}), ...(content.slideBlueprint ? { slideBlueprint: content.slideBlueprint } : {}), slides: content.slides, ...(content.implementations ? { implementations: content.implementations } : {}), ...(content.codeMap ? { codeMap: content.codeMap } : {}) }, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ok: true, file: paths.presentationContentFile, slides: content.slides.length }, null, 2));
  } else if (command === 'render') {
    console.log(JSON.stringify(renderAssignment(code), null, 2));
  } else if (command === 'export') {
    console.log(JSON.stringify(exportAssignment(code), null, 2));
  } else if (command === 'hub') {
    console.log(JSON.stringify(renderHub(), null, 2));
  } else if (command === 'github') {
    console.log(JSON.stringify(configureGithub(code, option('--owner'), option('--repo')), null, 2));
  } else if (command === 'publish') {
    if (args.includes('--push')) console.log(JSON.stringify(publish(code, option('--message', `Submit ${code}`)), null, 2));
    else console.log(JSON.stringify(publishPreflight(code), null, 2));
  } else if (command === 'intent') {
    const message = args.slice(2).join(' ');
    const result = routeMessage(code, message);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else {
    fail(usage);
  }
} catch (error) { fail(error.message); }
