import { readFileSync } from 'node:fs';
import path from 'node:path';

const config = JSON.parse(readFileSync(path.resolve(new URL('../config/workflow.json', import.meta.url).pathname), 'utf8'));

export function detectIntent(message) {
  const text = String(message || '').trim().replace(/[.!?。！？]+$/u, '').trim();
  const negation = /아직|아니|않|못|취소|보류|미루|말고|하지\s*말|하지\s*않/u;
  if (negation.test(text)) return null;
  for (const [intent, definition] of Object.entries(config.intents)) {
    if (definition.phrases.some((phrase) => text === phrase || text.includes(phrase))) return { intent, definition };
  }
  return null;
}

export function intentDefinition(intent) {
  return config.intents[intent] || null;
}

export function confirmationChoice(message) {
  const text = String(message || '').trim().replace(/[,.!?。！？、，]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (config.confirmation.yesPhrases.includes(text)) return 'yes';
  if (config.confirmation.noPhrases.includes(text)) return 'no';
  return null;
}
