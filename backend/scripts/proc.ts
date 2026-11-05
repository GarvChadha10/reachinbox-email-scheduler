/** Spawns the real API / worker entrypoints as child processes so scripts can SIGKILL and restart them. */
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LOG_DIR = join(backendDir, '.e2e-logs');
mkdirSync(LOG_DIR, { recursive: true });

// Never leave orphaned API/worker processes behind, even when an assertion calls process.exit(1).
const children = new Set<ChildProcess>();
process.on('exit', () => {
  for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL');
});

export function start(kind: 'api' | 'worker', logName: string, extraEnv: Record<string, string> = {}): ChildProcess {
  const entry = kind === 'api' ? 'src/api/server.ts' : 'src/worker/worker.ts';
  const out = createWriteStream(join(LOG_DIR, `${logName}.log`), { flags: 'a' });
  // Run node directly (not npm/npx) so SIGKILL hits the real process.
  const child = spawn(process.execPath, ['--env-file-if-exists=../.env', '--import', 'tsx', entry], {
    cwd: backendDir,
    env: { ...process.env, LOG_LEVEL: 'info', ...extraEnv }, // piped stdout => JSON logs
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.stdout!.pipe(out);
  child.stderr!.pipe(out);
  return child;
}

/** Kill and wait until the child's output pipes are fully drained into its log file. */
export function kill(child: ChildProcess, signal: NodeJS.Signals = 'SIGKILL'): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('close', () => setTimeout(resolve, 200));
    child.kill(signal);
  });
}

/** Count "sent" log lines per email id across log files (proves each email hit SMTP once). */
export function sentCounts(logNames: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const name of logNames) {
    let text = '';
    try {
      text = readFileSync(join(LOG_DIR, `${name}.log`), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      if (!line.startsWith('{')) continue;
      try {
        const j = JSON.parse(line) as { msg?: string; emailId?: string };
        if (j.msg === 'sent' && j.emailId) m.set(j.emailId, (m.get(j.emailId) ?? 0) + 1);
      } catch {
        /* non-JSON line */
      }
    }
  }
  return m;
}

export async function waitForHealth(url: string, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}
