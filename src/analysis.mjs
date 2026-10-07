import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { assignmentPaths, loadState, saveState } from './storage.mjs';

function readJson(file, label) {
  if (!existsSync(file)) throw new Error(`${label} not found: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function saveAnalysis(code, codeMap, presentationPlan) {
  const state = loadState(code);
  if (!['analyze', 'presentation'].includes(state.phase)) throw new Error(`Analysis can only be saved in analyze or presentation phase: ${state.phase}`);
  const previousPhase = state.phase;
  const paths = assignmentPaths(code);
  const regions = Array.isArray(codeMap?.regions) ? codeMap.regions : [];
  const chapters = Array.isArray(presentationPlan?.chapters) ? presentationPlan.chapters : [];
  const slides = Array.isArray(presentationPlan?.slides) ? presentationPlan.slides : [];
  const coverageMatrix = Array.isArray(presentationPlan?.coverageMatrix) ? presentationPlan.coverageMatrix : [];
  if (!chapters.length) throw new Error('presentation-plan must contain at least one chapter.');
  if (new Set(chapters.map((chapter) => chapter.id)).size !== chapters.length) throw new Error('Presentation chapter IDs must be unique.');
  for (const chapter of chapters) if (new Set((chapter.themes || []).map((theme) => theme.id)).size !== (chapter.themes || []).length) throw new Error(`Theme IDs must be unique within chapter ${chapter.id}.`);
  const requirements = readJson(paths.requirementsFile, 'requirements');
  const activeIds = new Set(requirements.items
    .filter((item) => item.scope !== 'optional' || item.included === true)
    .map((item) => item.id));
  const activeCriteria = new Map(requirements.items
    .filter((item) => item.scope !== 'optional' || item.included === true)
    .flatMap((item) => item.acceptanceCriteria.map((criterion) => [`${item.id}:${criterion.id}`, { requirementId: item.id, criterionId: criterion.id }])));
  if (coverageMatrix.length) {
    const coveredCriteria = new Set();
    for (const entry of coverageMatrix) {
      if (!activeIds.has(entry.requirementId) || !Array.isArray(entry.criterionIds) || !Array.isArray(entry.themeIds) || !entry.themeIds.length) {
        throw new Error(`Invalid coverage matrix entry for ${entry.requirementId || '(missing requirement)'}.`);
      }
      for (const criterionId of entry.criterionIds) {
        if (!activeCriteria.has(`${entry.requirementId}:${criterionId}`)) throw new Error(`Unknown acceptance criterion in coverage matrix: ${entry.requirementId}:${criterionId}`);
        coveredCriteria.add(`${entry.requirementId}:${criterionId}`);
      }
    }
    const uncoveredCriteria = [...activeCriteria.keys()].filter((key) => !coveredCriteria.has(key));
    if (uncoveredCriteria.length) throw new Error(`Coverage matrix does not cover: ${uncoveredCriteria.join(', ')}`);
  }
  const allIds = new Set(requirements.items.map((item) => item.id));
  const traces = Array.isArray(codeMap?.requirementTraces) ? codeMap.requirementTraces : [];
  if (regions.length || traces.length) {
    throw new Error('Analysis is narrative-only. Move code regions and requirement traces into presentation-content generation.');
  }
  const narrativeOnly = regions.length === 0 && traces.length === 0;
  const regionIds = new Set(regions.map((region) => region.id));
  if (regionIds.size !== regions.length) throw new Error('code-map region IDs must be unique.');
  const tracedIds = new Set(traces.map((trace) => trace.requirementId));
  if (tracedIds.size !== traces.length) throw new Error('Each requirement must have at most one end-to-end trace.');

  for (const region of regions) {
    for (const requirementId of region.requirementIds || []) {
      if (!allIds.has(requirementId)) throw new Error(`Unknown requirement ID in code-map region ${region.id}: ${requirementId}`);
    }
  }

  const presentedIds = new Set();
  const slideIds = new Set();
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const themeById = new Map(chapters.flatMap((chapter) => (chapter.themes || []).map((theme) => [`${chapter.id}:${theme.id}`, theme])));
  const allowedTypes = ['cover', 'chapter-cover', 'code', 'terminal', 'image'];
  if (!narrativeOnly && (slides[0]?.type !== 'cover' || slides.filter((slide) => slide.type === 'cover').length !== 1)) throw new Error('Presentation plan must start with exactly one cover slide.');
  const chapterCoverPositions = new Map();
  for (const [index, slide] of slides.entries()) {
    if (!slide.id || slideIds.has(slide.id)) throw new Error(`Presentation slide IDs must be present and unique: ${slide.id || '(missing)'}`);
    if (slide.type !== 'chapter-cover' && !slide.title?.trim()) throw new Error(`Presentation slide ${slide.id || '(missing)'} needs a title.`);
    slideIds.add(slide.id);
    if (!allowedTypes.includes(slide.type)) throw new Error(`Unsupported slide type in ${slide.id}: ${slide.type}`);
    if (slide.type === 'cover') {
      if (!slide.title) throw new Error(`Cover slide ${slide.id} needs a title.`);
      if (!Array.isArray(slide.chapterIds) || slide.chapterIds.length !== chapters.length || slide.chapterIds.some((id, index) => id !== chapters[index].id)) throw new Error(`Cover slide ${slide.id} must list all chapters in presentation order.`);
      continue;
    }
    if (slide.type === 'chapter-cover') {
      const chapter = chapterById.get(slide.chapterId);
      if (!chapter) throw new Error(`Chapter-cover slide ${slide.id} references unknown chapter ${slide.chapterId}.`);
      if (chapterCoverPositions.has(slide.chapterId)) throw new Error(`Chapter ${slide.chapterId} has more than one chapter-cover slide.`);
      chapterCoverPositions.set(slide.chapterId, index);
      continue;
    }
    const theme = themeById.get(`${slide.chapterId}:${slide.themeId}`);
    if (!chapterById.has(slide.chapterId) || !theme) throw new Error(`Presentation slide ${slide.id} needs valid chapterId and themeId references.`);
    if (chapterCoverPositions.get(slide.chapterId) === undefined || chapterCoverPositions.get(slide.chapterId) >= index) throw new Error(`Chapter-cover slide for ${slide.chapterId} must precede its content slides.`);
    if (!narrativeOnly && (!Array.isArray(slide.requirementIds) || !slide.requirementIds.length)) throw new Error(`Presentation slide ${slide.id} must cite its requirement IDs.`);
    for (const requirementId of slide.requirementIds) {
      if (!activeIds.has(requirementId)) throw new Error(`Presentation slide ${slide.id} references inactive or unknown requirement ${requirementId}`);
      presentedIds.add(requirementId);
    }
    if (!narrativeOnly && slide.type === 'code') {
      if (!slide.file || !Array.isArray(slide.regionIds) || !slide.regionIds.length) throw new Error(`Code slide ${slide.id} needs one file and at least one code region.`);
      for (const regionId of slide.regionIds) {
        if (!regionIds.has(regionId)) throw new Error(`Unknown code-map region in slide ${slide.id}: ${regionId}`);
        const region = regions.find((item) => item.id === regionId);
        if (region.file !== slide.file) throw new Error(`Code slide ${slide.id} can only reference regions from ${slide.file}; ${regionId} belongs to ${region.file}.`);
      }
    }
  }
  if (!narrativeOnly) for (const chapter of chapters) if (!chapterCoverPositions.has(chapter.id)) throw new Error(`Chapter ${chapter.id} needs an explicit chapter-cover slide.`);
  const chapterCoverOrder = chapters.map((chapter) => chapterCoverPositions.get(chapter.id));
  if (chapterCoverOrder.some((position, index) => index > 0 && position < chapterCoverOrder[index - 1])) throw new Error('Chapter-cover slides must follow chapter order.');

  const findings = Array.isArray(codeMap?.findings) ? codeMap.findings : [];
  for (const finding of findings) {
    if (!allIds.has(finding.requirementId)) throw new Error(`Unknown requirement ID in analysis finding: ${finding.requirementId}`);
    if (!['not-found', 'mismatch', 'uncertain'].includes(finding.status) || !finding.summary) {
      throw new Error(`Analysis finding for ${finding.requirementId} needs a supported status and summary.`);
    }
  }

  for (const trace of traces) {
    if (!allIds.has(trace.requirementId)) throw new Error(`Unknown requirement ID in requirement trace: ${trace.requirementId}`);
    for (const regionId of trace.regionIds || []) {
      const region = regions.find((item) => item.id === regionId);
      if (!region) throw new Error(`Unknown code region in requirement trace ${trace.requirementId}: ${regionId}`);
      if (!(region.requirementIds || []).includes(trace.requirementId)) {
        throw new Error(`Region ${regionId} must link back to requirement ${trace.requirementId}.`);
      }
    }
  }

  const blockers = findings.filter((finding) => activeIds.has(finding.requirementId));
  const uniqueBlockers = [...new Map(blockers.map((finding) => [`${finding.requirementId}:${finding.status}`, finding])).values()];
  const traceByRequirement = new Map(traces.map((trace) => [trace.requirementId, trace]));
  const uncoveredRequirements = narrativeOnly ? [] : [...activeIds].filter((id) => !presentedIds.has(id));
  const incompleteTraces = narrativeOnly ? [] : [...activeIds]
    .filter((id) => {
      const trace = traceByRequirement.get(id);
      return !trace || !trace.flow || !trace.boundary || !Array.isArray(trace.regionIds);
    })
    .map((requirementId) => ({ type: 'incomplete-requirement-trace', requirementId }));
  const incompleteThemes = chapters.flatMap((chapter) => (chapter.themes || [])
    .filter((theme) => !theme.takeaway || !theme.explanation || !theme.result || !Array.isArray(theme.concepts) || (!narrativeOnly && (!Array.isArray(theme.evidence) || !theme.evidence.length)) || (!narrativeOnly && !slides.some((slide) => slide.chapterId === chapter.id && slide.themeId === theme.id)))
    .map((theme) => ({ chapterId: chapter.id, themeId: theme.id })));
  const planningGaps = [
    ...uncoveredRequirements.map((requirementId) => ({ type: 'uncovered-requirement', requirementId })),
    ...incompleteTraces,
    ...chapters.filter((chapter) => !chapter.purpose).map((chapter) => ({ type: 'missing-chapter-purpose', chapterId: chapter.id })),
    ...incompleteThemes.map((theme) => ({ type: 'incomplete-theme', ...theme })),
  ];
  const contentSlides = slides.filter((slide) => !['cover', 'chapter-cover'].includes(slide.type));
  if (regions.length && !contentSlides.some((slide) => slide.type === 'code')) {
    planningGaps.push({ type: 'unpresented-code-map', summary: '분석된 코드 영역을 최소 하나 이상의 code 슬라이드에서 보여줘야 합니다.' });
  }

  const normalizedMap = { version: 1, regions: [], requirementTraces: [], findings: uniqueBlockers };
  const normalizedPlan = { version: 1, status: 'draft', chapters, ...(coverageMatrix.length ? { coverageMatrix } : {}), ...(slides.length ? { slides } : {}) };
  const codeMapPath = paths.analysisPlanFile.replace('presentation-plan.json', 'code-map.json');
  rmSync(codeMapPath, { force: true });
  writeFileSync(paths.analysisPlanFile, `${JSON.stringify(normalizedPlan, null, 2)}\n`, 'utf8');
  if (uniqueBlockers.length) {
    state.phase = 'artifact';
    state.pendingTransition = null;
    state.validation = { status: 'not-run' };
    state.analysis = { status: 'blocked', findings: uniqueBlockers, returnedAt: new Date().toISOString() };
    state.history.push({ event: 'analysis-returned-to-artifact', findings: uniqueBlockers, at: state.analysis.returnedAt });
  } else {
    state.analysis = { status: planningGaps.length ? 'needs-revision' : 'ready', requirementCount: activeIds.size, mappedRequirementCount: presentedIds.size, planningGaps, checkedAt: new Date().toISOString() };
    state.history.push({ event: planningGaps.length ? 'analysis-plan-needs-revision' : 'analysis-saved', chapters: chapters.length, regions: regions.length, planningGaps, at: state.analysis.checkedAt });
  }
  if (previousPhase === 'presentation') {
    if (!uniqueBlockers.length) {
      state.phase = 'analyze';
      state.history.push({ event: 'analysis-reopened', from: 'presentation', to: 'analyze', at: new Date().toISOString() });
    }
  }
  saveState(state);
  return { codeMap: narrativeOnly ? null : normalizedMap, presentationPlan: normalizedPlan, status: uniqueBlockers.length ? 'blocked' : planningGaps.length ? 'needs-revision' : 'ready', phase: state.phase, findings: uniqueBlockers, planningGaps };
}

export function loadAnalysis(code) {
  const paths = assignmentPaths(code);
  return {
    codeMap: readJson(paths.analysisPlanFile.replace('presentation-plan.json', 'code-map.json'), 'code-map'),
    presentationPlan: readJson(paths.analysisPlanFile, 'presentation-plan'),
  };
}

export function analysisReadiness(code, { allowApproved = false } = {}) {
  const paths = assignmentPaths(code);
  if (!existsSync(paths.analysisPlanFile)) return { ready: false, blockers: ['presentation-plan is missing.'] };
  const codeMapPath = paths.analysisPlanFile.replace('presentation-plan.json', 'code-map.json');
  const requirements = readJson(paths.requirementsFile, 'requirements');
  if (!existsSync(codeMapPath)) {
    const presentationPlan = readJson(paths.analysisPlanFile, 'presentation-plan');
    const blockers = [];
    for (const chapter of presentationPlan.chapters || []) {
      if (!chapter.purpose) blockers.push(`Chapter ${chapter.id} is missing its presentation purpose.`);
      for (const theme of chapter.themes || []) if (!theme.takeaway || !theme.explanation || !theme.result || !Array.isArray(theme.concepts)) blockers.push(`Theme ${theme.id} is missing its narrative fields.`);
    }
    return { ready: blockers.length === 0, blockers };
  }
  const { codeMap, presentationPlan } = loadAnalysis(code);
  const contentMode = presentationPlan.status === 'approved' && Array.isArray(presentationPlan.slides) && presentationPlan.slides.length > 0;
  const narrativeOnly = (!codeMap.regions?.length && !codeMap.requirementTraces?.length)
    && (!presentationPlan.slides?.length || presentationPlan.slides.every((slide) => ['cover', 'chapter-cover'].includes(slide.type)));
  if (narrativeOnly) {
    const blockers = [];
    const chapters = Array.isArray(presentationPlan.chapters) ? presentationPlan.chapters : [];
    if (!chapters.length) blockers.push('Presentation plan must contain at least one narrative chapter.');
    for (const chapter of chapters) {
      if (!chapter.purpose) blockers.push(`Chapter ${chapter.id} is missing its presentation purpose.`);
      for (const theme of chapter.themes || []) {
        if (!theme.takeaway || !theme.explanation || !theme.result || !Array.isArray(theme.concepts)) {
          blockers.push(`Theme ${theme.id} is missing its narrative fields.`);
        }
      }
    }
    return { ready: blockers.length === 0, blockers };
  }
  const activeIds = new Set(requirements.items
    .filter((item) => item.scope !== 'optional' || item.included === true)
    .map((item) => item.id));
  const regionById = new Map(codeMap.regions.map((region) => [region.id, region]));
  const plannedRegionIds = new Set();
  const presentedIds = new Set();
  const contentPath = assignmentPaths(code).analysisPlanFile.replace('presentation-plan.json', 'presentation-content.json');
  const presentationContent = existsSync(contentPath) ? readJson(contentPath, 'presentation-content') : null;
  const slides = Array.isArray(presentationContent?.slides) && presentationContent.slides.length
    ? presentationContent.slides
    : (Array.isArray(presentationPlan.slides) ? presentationPlan.slides : []);
  const chapters = Array.isArray(presentationPlan.chapters) ? presentationPlan.chapters : [];
  const blockers = [];
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const themeById = new Map(chapters.flatMap((chapter) => (chapter.themes || []).map((theme) => [`${chapter.id}:${theme.id}`, theme])));
  if (slides[0]?.type !== 'cover' || slides.filter((slide) => slide.type === 'cover').length !== 1) blockers.push('Presentation plan must start with exactly one cover slide.');
  if (!chapters.length || slides[0]?.chapterIds?.length !== chapters.length || slides[0]?.chapterIds?.some((id, index) => id !== chapters[index]?.id)) blockers.push('Cover slide must list all chapters in presentation order.');
  const chapterCoverPositions = new Map();
  for (const [index, slide] of slides.entries()) {
    if (slide.type === 'chapter-cover') {
      if (!chapterById.has(slide.chapterId)) blockers.push(`Chapter-cover slide ${slide.id} references unknown chapter ${slide.chapterId}.`);
      else if (chapterCoverPositions.has(slide.chapterId)) blockers.push(`Chapter ${slide.chapterId} has more than one chapter-cover slide.`);
      else chapterCoverPositions.set(slide.chapterId, index);
      continue;
    }
    if (slide.type === 'cover') continue;
    const theme = themeById.get(`${slide.chapterId}:${slide.themeId}`);
    if (!chapterById.has(slide.chapterId) || !theme) blockers.push(`Slide ${slide.id} has invalid chapterId or themeId references.`);
    if (chapterCoverPositions.get(slide.chapterId) === undefined || chapterCoverPositions.get(slide.chapterId) >= index) blockers.push(`Chapter-cover slide for ${slide.chapterId} must precede its content slides.`);
    for (const requirementId of slide.requirementIds || []) presentedIds.add(requirementId);
    if (slide.type === 'code') for (const regionId of slide.regionIds || []) plannedRegionIds.add(regionId);
  }
  for (const chapter of chapters) if (!chapterCoverPositions.has(chapter.id)) blockers.push(`Chapter ${chapter.id} needs an explicit chapter-cover slide.`);
  const chapterCoverOrder = chapters.map((chapter) => chapterCoverPositions.get(chapter.id)).filter(Number.isInteger);
  if (chapterCoverOrder.some((position, index) => index > 0 && position < chapterCoverOrder[index - 1])) blockers.push('Chapter-cover slides must follow chapter order.');
  const traces = Array.isArray(codeMap.requirementTraces) ? codeMap.requirementTraces : [];
  const traceByRequirement = new Map(traces.map((trace) => [trace.requirementId, trace]));
  for (const requirementId of activeIds) {
    if (!presentedIds.has(requirementId)) blockers.push(`Requirement ${requirementId} is not covered by a presentation slide.`);
    const trace = traceByRequirement.get(requirementId);
    if (!contentMode && (!trace || !trace.flow || !trace.boundary || !Array.isArray(trace.regionIds))) {
      blockers.push(`Requirement ${requirementId} is missing its implementation trace and boundary rationale.`);
    }
  }
  for (const finding of codeMap.findings || []) {
    if (activeIds.has(finding.requirementId)) blockers.push(`${finding.requirementId}: ${finding.status} - ${finding.summary}`);
  }
  for (const regionId of plannedRegionIds) {
    if (!regionById.has(regionId)) blockers.push(`Presentation plan references unknown code region ${regionId}.`);
  }
  for (const trace of traces) {
    for (const regionId of trace.regionIds || []) {
      const region = regionById.get(regionId);
      if (!region) blockers.push(`Requirement trace references unknown code region ${regionId}.`);
      else if (!(region.requirementIds || []).includes(trace.requirementId)) blockers.push(`Requirement trace and code region ${regionId} disagree about ${trace.requirementId}.`);
    }
  }
  for (const chapter of chapters) {
    if (!chapter.purpose) blockers.push(`Chapter ${chapter.id} is missing its presentation purpose.`);
    for (const theme of chapter.themes) {
      const hasContentSlide = slides.some((slide) => slide.chapterId === chapter.id && slide.themeId === theme.id);
      const missingNarrative = !theme.takeaway || !theme.explanation || !theme.result || !Array.isArray(theme.concepts) || !Array.isArray(theme.evidence) || !theme.evidence.length;
      if ((!contentMode && missingNarrative) || !hasContentSlide) {
        blockers.push(`Theme ${theme.id} is missing its narrative, concepts, result, evidence, or typed slides.`);
      }
    }
  }
  const slideIds = new Set();
  for (const slide of slides) {
    if (!['cover', 'chapter-cover', 'code', 'terminal', 'image'].includes(slide.type)) blockers.push(`Slide ${slide.id} has unsupported type ${slide.type}.`);
    if (!slide.id || slideIds.has(slide.id)) blockers.push(`Presentation slide ID is missing or duplicated: ${slide.id || '(missing)'}.`);
    slideIds.add(slide.id);
    if (slide.type === 'cover' && !slide.title) blockers.push(`Cover slide ${slide.id} is missing its title.`);
    if (slide.type === 'chapter-cover') continue;
    if (slide.type === 'cover') continue;
    for (const requirementId of slide.requirementIds || []) if (!activeIds.has(requirementId)) blockers.push(`Slide ${slide.id} references inactive or unknown requirement ${requirementId}.`);
    if (slide.type === 'code') {
      if (!slide.file || !Array.isArray(slide.regionIds) || !slide.regionIds.length) blockers.push(`Code slide ${slide.id} needs one file and at least one code region.`);
      for (const regionId of slide.regionIds || []) {
        const region = regionById.get(regionId);
        if (!region) blockers.push(`Presentation slide references unknown code region ${regionId}.`);
        else if (region.file !== slide.file) blockers.push(`Code slide ${slide.id} references ${regionId} from ${region.file}, not its declared file ${slide.file}.`);
      }
    }
  }
  if (!contentMode && stateAnalysisNotReady(code)) blockers.push('Analysis plan has not passed its completeness check.');
  if (presentationPlan.status !== 'draft' && !(allowApproved && presentationPlan.status === 'approved')) blockers.push('Presentation plan must be a draft before approval.');
  return { ready: blockers.length === 0, blockers };
}

function stateAnalysisNotReady(code) {
  return loadState(code).analysis?.status !== 'ready';
}
