#!/usr/bin/env node
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assignmentPaths } from '../src/storage.mjs';

const [, , assignmentCode, ...args] = process.argv;
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};

if (!assignmentCode || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: run-code-explanations-agent <assignment-code> [--from <slide-number>] [--purpose-only] [--agent <command>] [--model <model>] [--reasoning-effort <level>] [--parallel <count>]');
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const paths = assignmentPaths(assignmentCode);
const contentSkill = fileURLToPath(new URL('../skills/presentation-content-generator/SKILL.md', import.meta.url));
const content = JSON.parse(readFileSync(paths.presentationContentFile, 'utf8'));
const from = Number(option('--from', '1'));
const purposeOnly = args.includes('--purpose-only');
const parallel = Math.max(1, Math.min(8, Number(option('--parallel', '4')) || 4));
const executable = option('--agent', process.env.CODyssey_AGENT_COMMAND || 'codex');
const model = option('--model', process.env.CODyssey_AGENT_MODEL || 'gpt-5.6-luna');
const reasoningEffort = option('--reasoning-effort', process.env.CODyssey_AGENT_REASONING_EFFORT || 'low');
const slides = content.slides.filter((slide) => slide.type === 'code' && slide.slideNumber >= from);
const logFile = `${paths.presentationDir}/code-explanations-agent.log`;
const logFd = openSync(logFile, 'w');

if (!slides.length) throw new Error(`No existing code slides at or after slide ${from}.`);

function readRanges(slide) {
  return slide.regionIds.map((regionId) => {
    const region = content.codeMap?.regions?.find((entry) => entry.id === regionId);
    if (!region) throw new Error(`Missing code region ${regionId} for ${slide.id}.`);
    const file = `${paths.artifactDir}/${region.file}`;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/u);
    const excerpt = lines.slice(region.lineStart - 1, region.lineEnd).map((line, index) => `${region.lineStart + index}: ${line}`).join('\n');
    return { region, excerpt };
  });
}

function makeTask(slide) {
  const outputFile = `${paths.presentationDir}/.agent-learning-${slide.slideNumber}.json`;
  const ranges = readRanges(slide);
  const prompt = [
    `Assignment ${assignmentCode}: ${purposeOnly ? 'write one slide-level purpose statement' : 'update explanation data'} for one existing code slide only.`,
    `Existing slide (identity and code are fixed; do not create or alter slides): ${JSON.stringify({ id: slide.id, slideNumber: slide.slideNumber, title: slide.title, file: slide.file, regionIds: slide.regionIds })}.`,
    `Existing source regions in order:\n${ranges.map(({ region, excerpt }) => `${region.file}:${region.lineStart}-${region.lineEnd}\n${excerpt}`).join('\n\n')}`,
    ...(purposeOnly ? [] : [`Follow ${contentSkill} for code explanations.`]),
    purposeOnly
      ? 'Return only a JSON object with the shape {"purpose":"..."}. The supplied source excerpts are the complete code scope represented by this slide and its code blocks. Write one concise, intuitive sentence stating what these pieces collectively accomplish. Focus on the user-visible or data-flow goal, not the mechanics of one fragment; do not invent behavior. The orchestrator saves it as learning.purpose and preserves the existing codeBlocks.'
      : 'Return only a JSON object with the shape {"purpose":"...","codeBlocks":[{"lines":"start-end","details":["..."]}]}. The purpose is one concise statement for the collective intent of the whole slide, not an individual code block. The orchestrator places it in this existing slide’s learning field.',
    'Do not return slide metadata, add/change any slide, or edit presentation-content.json. Do not use templates or generated filler. Explain the existing code in source order with enough concrete detail for a beginner to follow syntax, values, and data/control flow.',
    `Write the JSON object to: ${outputFile}`
  ].join('\n');
  const commandArgs = executable === 'codex'
    ? ['exec', '-C', paths.assignmentRoot, '-s', 'danger-full-access', '--model', model, '-c', `model_reasoning_effort="${reasoningEffort}"`, prompt]
    : [prompt];
  return { slide, outputFile, commandArgs };
}

function runTask(task) {
  return new Promise((resolve) => {
    const child = spawn(executable, task.commandArgs, { cwd: paths.assignmentRoot, stdio: ['ignore', logFd, logFd], env: process.env });
    child.once('error', (error) => resolve({ ...task, code: null, error }));
    child.once('close', (code, signal) => resolve({ ...task, code, signal }));
  });
}

function validateLearning(slide, learning) {
  if (typeof learning?.purpose !== 'string' || !learning.purpose.trim()) throw new Error(`Missing slide-level purpose for ${slide.id}.`);
  if (purposeOnly) return;
  if (!Array.isArray(learning?.codeBlocks) || !learning.codeBlocks.length) throw new Error(`Missing codeBlocks for ${slide.id}.`);
  const regions = slide.regionIds.map((id) => content.codeMap.regions.find((region) => region.id === id));
  const used = new Map();
  for (const block of learning.codeBlocks) {
    const match = String(block.lines || '').match(/^(\d+)(?:-(\d+))?$/u);
    if (!match || !Array.isArray(block.details) || !block.details.length || block.details.some((detail) => typeof detail !== 'string' || !detail.trim())) throw new Error(`Invalid explanation block for ${slide.id}.`);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    const region = regions.find((entry) => start >= entry.lineStart && end <= entry.lineEnd);
    if (!region) throw new Error(`Explanation lines ${block.lines} are outside ${slide.id}'s source region.`);
    const previous = used.get(region.file) || [];
    if (previous.some((range) => start <= range.end && range.start <= end)) throw new Error(`Overlapping explanation ranges in ${slide.id}.`);
    previous.push({ start, end });
    used.set(region.file, previous);
  }
}

function persistLearning(slide, learning) {
  if (purposeOnly && (typeof learning?.purpose !== 'string' || !learning.purpose.trim())) throw new Error(`Missing slide-level purpose for ${slide.id}.`);
  if (!purposeOnly) validateLearning(slide, learning);
  const latest = JSON.parse(readFileSync(paths.presentationContentFile, 'utf8'));
  const target = latest.slides.find((entry) => entry.id === slide.id);
  if (!target || target.type !== 'code') throw new Error(`Existing code slide ${slide.id} changed during generation.`);
  target.learning = purposeOnly ? { ...target.learning, purpose: learning.purpose } : learning;
  writeFileSync(paths.presentationContentFile, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
}

try {
  for (let offset = 0; offset < slides.length; offset += parallel) {
    const batch = slides.slice(offset, offset + parallel);
    console.log(`generating explanations for existing code slides ${batch[0].slideNumber}-${batch.at(-1).slideNumber} (${batch.length} agents in parallel)`);
    const results = await Promise.all(batch.map((slide) => runTask(makeTask(slide))));
    for (const result of results.sort((a, b) => a.slide.slideNumber - b.slide.slideNumber)) {
      if (result.code !== 0) throw new Error(`Agent failed for slide ${result.slide.slideNumber}; see ${logFile}`);
      try {
        const learning = JSON.parse(readFileSync(result.outputFile, 'utf8'));
        persistLearning(result.slide, learning);
        console.log(`updated explanation for existing slide ${result.slide.slideNumber}`);
      } finally {
        unlinkSync(result.outputFile);
      }
    }
  }
  console.log(`updated ${purposeOnly ? 'slide-level purposes on' : 'explanations on'} ${slides.length} existing code slides; slide count unchanged`);
} finally {
  closeSync(logFd);
}
