#!/usr/bin/env node
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assignmentPaths } from '../src/storage.mjs';

const [, , assignmentCode, ...args] = process.argv;
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};

if (!assignmentCode || assignmentCode.startsWith('-') || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: run-presentation-content-agent <assignment-code> [--from <slide-number>] [--agent <command>] [--model <model>] [--reasoning-effort <level>] [--parallel <count>]');
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const paths = assignmentPaths(assignmentCode);
const content = JSON.parse(readFileSync(paths.presentationContentFile, 'utf8'));
const from = Number(option('--from', '1'));
const parallel = Math.max(1, Math.min(8, Number(option('--parallel', '4')) || 4));
const executable = option('--agent', process.env.CODyssey_AGENT_COMMAND || 'codex');
const model = option('--model', process.env.CODyssey_AGENT_MODEL || 'gpt-5.6-luna');
const reasoningEffort = option('--reasoning-effort', process.env.CODyssey_AGENT_REASONING_EFFORT || 'low');
const blueprintSlides = (content.slideBlueprint || []).flatMap((entry) => (entry.slides || []).map((slide) => ({
  ...slide,
  chapterId: slide.chapterId || entry.chapterId,
  themeId: slide.themeId || entry.themeId,
  slideNumber: slide.slideNumber || 0
})));
blueprintSlides.forEach((slide, index) => { if (!slide.slideNumber) slide.slideNumber = index + 1; });
const slides = blueprintSlides.filter((slide) => slide.slideNumber >= from);
const harness = fileURLToPath(new URL('./codyssey-harness.mjs', import.meta.url));
const contentSkill = fileURLToPath(new URL('../skills/presentation-content-generator/SKILL.md', import.meta.url));
const current = JSON.parse(readFileSync(paths.presentationContentFile, 'utf8'));
const pending = slides.filter((slide) => !(current.slides || []).some((saved) => saved.id === slide.id));

if (!pending.length) {
  console.log('no pending presentation slides');
  process.exit(0);
}

const logFile = `${paths.presentationDir}/presentation-content-agent.log`;
const logFd = openSync(logFile, 'w');
const regionBySlideId = new Map((content.codeMap?.regions || []).map((region) => [region.slideId, region]));
const chapterById = new Map((content.chapters || []).map((chapter) => [chapter.id, chapter]));
const requirementById = new Map((content.requirements || []).map((item) => [item.id, item]));

function makeSlideTask(blueprint) {
  const region = regionBySlideId.get(blueprint.id);
  const sourcePath = region ? `${paths.artifactDir}/${region.file}` : '';
  const source = region && existsSync(sourcePath)
    ? readFileSync(sourcePath, 'utf8').split(/\r?\n/).slice(region.lineStart - 1, region.lineEnd).map((line, index) => `${region.lineStart + index}: ${line}`).join('\n')
    : '';
  const chapter = chapterById.get(blueprint.chapterId);
  const theme = chapter?.themes?.find((item) => item.id === blueprint.themeId);
  const requirementIds = region?.requirementIds || (chapter?.requirementId ? [chapter.requirementId] : []);
  const criterionIds = region?.criterionIds || theme?.criterionIds || chapter?.themes?.flatMap((item) => item.criterionIds || []) || [];
  const slideFile = `${paths.presentationDir}/.agent-slide-${blueprint.slideNumber}.json`;
  const slideContext = {
    id: blueprint.id,
    slideNumber: blueprint.slideNumber,
    type: blueprint.type,
    title: blueprint.title,
    chapterId: blueprint.chapterId,
    ...(blueprint.themeId ? { themeId: blueprint.themeId } : {}),
    requirementIds,
    criterionIds,
    ...(region ? { file: region.file, regionIds: [region.id], implementationId: region.implementationId } : {}),
    ...(blueprint.type === 'chapter-cover' && chapter ? { chapter } : {}),
    ...(theme ? { theme } : {})
  };
  const prompt = [
    `Assignment ${assignmentCode}: create exactly one slide JSON object.`,
    `Required slide fields/context: ${JSON.stringify(slideContext)}.`,
    `Approved blueprint entry: ${JSON.stringify(blueprint)}.`,
    region ? `Read this exact artifact source region in order:\n${region.file}:${region.lineStart}-${region.lineEnd}\n${source}` : 'This is a chapter cover; use its approved chapter data and do not invent implementation details.',
    `Follow the presentation-content-generator skill at ${contentSkill} for this slide only.`,
    'Write exactly one slide object as JSON to the temporary file. Do not edit presentation-content.json and do not run validate-slide or append-slide.',
    'For code slides, add learning.purpose: one concise, intuitive statement describing what all code blocks on this slide collectively accomplish. Then divide the supplied source range into non-overlapping semantic codeBlocks and author concrete, variable-length details bullets that explain meaningful syntax and data/control flow.',
    'Do not use rule-based templates, regex explanation generators, fallback prose, or codeRole. Use one slide-level purpose plus codeBlocks with lines and details.',
    `Temporary JSON file: ${slideFile}`
  ].join('\n');
  const commandArgs = executable === 'codex'
    ? ['exec', '-C', paths.assignmentRoot, '-s', 'danger-full-access', '--model', model, '-c', `model_reasoning_effort="${reasoningEffort}"`, prompt]
    : [prompt];
  return { blueprint, slideFile, commandArgs };
}

function runTask(task) {
  return new Promise((resolve) => {
    const child = spawn(executable, task.commandArgs, { cwd: paths.assignmentRoot, stdio: ['ignore', logFd, logFd], env: process.env });
    child.once('error', (error) => resolve({ ...task, code: null, error }));
    child.once('close', (code, signal) => resolve({ ...task, code, signal }));
  });
}

function runHarness(command, slideFile) {
  const result = spawnSync(process.execPath, [harness, command, assignmentCode, '--slide-file', slideFile], {
    cwd: paths.assignmentRoot,
    stdio: ['ignore', logFd, logFd]
  });
  if (result.status !== 0) throw new Error(`${command} failed for ${slideFile}; see ${logFile}`);
}

let completed = 0;
try {
  for (let offset = 0; offset < pending.length; offset += parallel) {
    const batch = pending.slice(offset, offset + parallel);
    console.log(`generating slides ${batch[0].slideNumber}-${batch.at(-1).slideNumber} (${batch.length} agents in parallel)`);
    const results = await Promise.all(batch.map((slide) => runTask(makeSlideTask(slide))));
    for (const result of results.sort((a, b) => a.blueprint.slideNumber - b.blueprint.slideNumber)) {
      if (result.code !== 0) throw new Error(`Agent failed while creating slide ${result.blueprint.slideNumber}. Full output: ${logFile}`);
      if (!existsSync(result.slideFile)) throw new Error(`Agent did not write slide ${result.blueprint.slideNumber}. Full output: ${logFile}`);
      runHarness('validate-slide', result.slideFile);
      runHarness('append-slide', result.slideFile);
      completed += 1;
      console.log(`validated and appended slide ${result.blueprint.slideNumber}`);
    }
  }
} finally {
  closeSync(logFd);
}

console.log(`completed ${completed} slides with up to ${parallel} parallel agents`);
