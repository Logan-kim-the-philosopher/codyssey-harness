import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { assignmentPaths, loadState, saveState } from './storage.mjs';

function classifyCriterion(criterion, paths) {
  const evidence = Array.isArray(criterion.evidence) ? criterion.evidence : [];
  const existingEvidence = evidence.filter((entry) => {
    if (typeof entry === 'object' && entry !== null) {
      return entry.type === 'agent-check' && entry.status === 'passed' && entry.note?.trim();
    }
    return existsSync(`${paths.assignmentRoot}/${entry}`) || existsSync(`${paths.artifactDir}/${entry}`);
  });
  if (!existsSync(paths.artifactDir)) return { ...criterion, status: 'missing', evidenceFound: [] };
  if (!evidence.length) return { ...criterion, status: 'unverified', evidenceFound: [] };
  if (existingEvidence.length === evidence.length) return { ...criterion, status: 'fulfilled', evidenceFound: existingEvidence };
  return { ...criterion, status: 'partial', evidenceFound: existingEvidence };
}

function aggregateStatus(criteria) {
  const active = criteria.filter((criterion) => criterion.status !== 'excluded');
  if (criteria.length && active.length === 0) return 'excluded';
  if (active.every((criterion) => criterion.status === 'fulfilled')) return 'fulfilled';
  if (active.every((criterion) => criterion.status === 'missing')) return 'missing';
  if (active.some((criterion) => ['fulfilled', 'partial'].includes(criterion.status))) return 'partial';
  return 'unverified';
}

export function validateAssignment(code) {
  const state = loadState(code);
  const paths = assignmentPaths(code);
  const requirements = JSON.parse(readFileSync(paths.requirementsFile, 'utf8'));
  const items = requirements.items.map((item) => {
    const acceptanceCriteria = item.scope === 'optional' && item.included === false
      ? item.acceptanceCriteria.map((criterion) => ({ ...criterion, status: 'excluded', evidenceFound: [] }))
      : item.acceptanceCriteria.map((criterion) => classifyCriterion(criterion, paths));
    return { ...item, acceptanceCriteria, status: aggregateStatus(acceptanceCriteria) };
  });
  const activeItems = items.filter((item) => item.status !== 'excluded');
  const missing = items.filter((item) => item.status === 'missing');
  const partial = items.filter((item) => item.status === 'partial');
  const unverified = items.filter((item) => item.status === 'unverified');
  const fulfilled = items.filter((item) => item.status === 'fulfilled');
  const criteria = items.flatMap((item) => item.acceptanceCriteria);
  const activeCriteria = criteria.filter((criterion) => criterion.status !== 'excluded');
  const criteriaMissing = activeCriteria.filter((criterion) => criterion.status === 'missing');
  const criteriaPartial = activeCriteria.filter((criterion) => criterion.status === 'partial');
  const criteriaUnverified = activeCriteria.filter((criterion) => criterion.status === 'unverified');
  const criteriaFulfilled = activeCriteria.filter((criterion) => criterion.status === 'fulfilled');
  const requirementsApproved = requirements.status === 'approved'
    && activeItems.length > 0
    && requirements.items.every((item) => item.scope === 'required' || typeof item.included === 'boolean');
  const status = !requirementsApproved || criteriaMissing.length || criteriaPartial.length || criteriaUnverified.length ? 'incomplete' : 'passed';
  const result = {
    version: 1,
    checkedAt: new Date().toISOString(),
    status,
    summary: {
      fulfilled: fulfilled.length,
      partial: partial.length,
      missing: missing.length,
      unverified: unverified.length,
      excluded: items.filter((item) => item.status === 'excluded').length,
      criteria: { fulfilled: criteriaFulfilled.length, partial: criteriaPartial.length, missing: criteriaMissing.length, unverified: criteriaUnverified.length, excluded: criteria.length - activeCriteria.length },
      requirementsApproved,
    },
    items,
  };
  state.validation = result;
  state.requirements.items = items;
  state.history.push({ event: 'requirements-validated', status, at: result.checkedAt });
  saveState(state);
  writeFileSync(paths.requirementsFile, `${JSON.stringify({ ...requirements, items, lastValidation: result.checkedAt }, null, 2)}\n`, 'utf8');
  return result;
}
