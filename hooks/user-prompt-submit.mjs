#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { routeMessage } from '../src/phase-machine.mjs';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input || '{}');
    const code = event.assignmentCode || process.env.CODyssey_ASSIGNMENT_CODE || activeCode(event.cwd || process.cwd());
    const message = event.message || event.prompt || '';
    if (!code) process.stdout.write(JSON.stringify({ ok: true, handled: false, reason: 'no-active-assignment' }));
    else {
      const result = routeMessage(code, message);
      if (result.agentTask?.status === 'queued' && process.env.CODyssey_DISABLE_AUTO_AGENT !== '1') {
        const runner = path.resolve(new URL('../scripts/codyssey-harness.mjs', import.meta.url).pathname);
        const consumed = spawnSync(process.execPath, [runner, 'consume-agent-task', code], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        result.agentExecution = { status: consumed.status === 0 ? 'completed' : 'failed', output: consumed.stdout, error: consumed.stderr || null };
      }
      process.stdout.write(JSON.stringify(result));
    }
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
  }
});

function activeCode(cwd) {
  const file = path.join(cwd, 'artifacts', 'codyssey-harness-active.json');
  if (!existsSync(file)) return null;
  try {
    const code = JSON.parse(readFileSync(file, 'utf8')).code || null;
    return code && existsSync(path.join(cwd, 'artifacts', code.toLowerCase(), 'harness-state.json')) ? code : null;
  } catch { return null; }
}
