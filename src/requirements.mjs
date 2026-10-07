import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assignmentPaths, loadState, saveState } from './storage.mjs';

const categories = new Set(['functional', 'quality', 'technical', 'delivery', 'bonus', 'constraint']);
const verificationMethods = new Set(['static', 'runtime', 'visual', 'manual', 'delivery']);
const comparable = (text) => String(text).replace(/\s+/gu, ' ').trim();

function validateDraft(draft, sourceText, checklistText) {
  if (!Array.isArray(draft?.items) || draft.items.length === 0) {
    throw new Error('Requirements draft must contain at least one item.');
  }
  return draft.items.map((item, index) => {
    if (!item.title?.trim()) throw new Error(`Requirement ${index + 1} needs a title.`);
    if (!categories.has(item.category)) throw new Error(`Requirement ${index + 1} has an invalid category.`);
    if (!['required', 'optional'].includes(item.scope)) throw new Error(`Requirement ${index + 1} needs required/optional scope.`);
    if (item.scope === 'required' && item.included !== true) throw new Error(`Required requirement ${index + 1} must be included.`);
    if (item.scope === 'optional' && item.included !== null && typeof item.included !== 'boolean') throw new Error(`Optional requirement ${index + 1} needs true, false, or null inclusion.`);
    if (!item.description?.trim()) throw new Error(`Requirement ${index + 1} needs a description.`);
    if (!Array.isArray(item.acceptanceCriteria) || item.acceptanceCriteria.length === 0 || item.acceptanceCriteria.some((criterion) => !(typeof criterion === 'string' ? criterion : criterion?.text)?.trim())) {
      throw new Error(`Requirement ${index + 1} needs at least one acceptance criterion.`);
    }
    if (!Array.isArray(item.sourceRefs) || item.sourceRefs.length === 0 || item.sourceRefs.some((ref) => {
      if (!['source', 'checklist'].includes(ref.document) || !ref.excerpt?.trim()) return true;
      const original = ref.document === 'source' ? sourceText : checklistText;
      return !comparable(original).includes(comparable(ref.excerpt));
    })) {
      throw new Error(`Requirement ${index + 1} needs a source/checklist excerpt.`);
    }
    if (!verificationMethods.has(item.verification)) throw new Error(`Requirement ${index + 1} has an invalid verification method.`);
    return {
      id: `REQ-${String(index + 1).padStart(3, '0')}`,
      title: item.title.trim(),
      category: item.category,
      scope: item.scope,
      included: item.scope === 'required' ? true : item.included,
      description: item.description.trim(),
      acceptanceCriteria: item.acceptanceCriteria.map((criterion, criterionIndex) => ({
        id: `REQ-${String(index + 1).padStart(3, '0')}-C${String(criterionIndex + 1).padStart(2, '0')}`,
        text: (typeof criterion === 'string' ? criterion : criterion.text).trim(),
        status: 'unverified',
        evidence: [],
      })),
      sourceRefs: item.sourceRefs.map((ref) => ({ document: ref.document, excerpt: ref.excerpt.trim() })),
      verification: item.verification,
      verificationRequired: item.verificationRequired === true,
      status: 'unverified',
    };
  });
}

export function saveRequirementsDraft(code, draft) {
  const state = loadState(code);
  if (state.phase !== 'intake') throw new Error(`Requirements can only be drafted in intake phase: ${state.phase}`);
  const paths = assignmentPaths(code);
  const sourceText = readFileSync(path.join(paths.assignmentDir, 'source.md'), 'utf8');
  const checklistText = readFileSync(path.join(paths.assignmentDir, 'checklist.md'), 'utf8');
  const items = validateDraft(draft, sourceText, checklistText);
  const requirements = {
    version: 1,
    status: 'draft',
    generatedAt: new Date().toISOString(),
    sourceFile: 'assignment/source.md',
    checklistFile: 'assignment/checklist.md',
    items,
  };
  writeFileSync(paths.requirementsFile, `${JSON.stringify(requirements, null, 2)}\n`, 'utf8');
  state.requirements = {
    sourceFile: requirements.sourceFile,
    checklistFile: requirements.checklistFile,
    status: requirements.status,
    items,
    generatedAt: requirements.generatedAt,
  };
  state.history.push({ event: 'requirements-drafted', count: items.length, at: requirements.generatedAt });
  saveState(state);
  return requirements;
}

export function loadRequirements(code) {
  const paths = assignmentPaths(code);
  return JSON.parse(readFileSync(paths.requirementsFile, 'utf8'));
}
