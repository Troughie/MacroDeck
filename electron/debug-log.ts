import { app } from 'electron';
import fs from 'fs';
import path from 'path';

// Mirrors console.log/warn/error to a file so the packaged .exe (which has no
// visible console) can be debugged. Truncated on each launch so it only holds
// the current run. Location: <userData>/macrodeck-debug.log — printed to the
// console on install so it can be found.
let installed = false;

export function installFileLogger(): void {
  if (installed) return;
  installed = true;
  try {
    const file = path.join(app.getPath('userData'), 'macrodeck-debug.log');
    const stream = fs.createWriteStream(file, { flags: 'w' });

    const write = (level: string, args: unknown[]): void => {
      try {
        const ts = new Date().toISOString();
        const line = args
          .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
          .join(' ');
        stream.write(`${ts} [${level}] ${line}\n`);
      } catch {
        /* never let logging throw */
      }
    };

    (['log', 'warn', 'error'] as const).forEach((level) => {
      const orig = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        write(level, args);
        orig(...args);
      };
    });

    console.log('[debug-log] file logger installed at', file);
  } catch {
    /* ignore — logging must never break startup */
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
