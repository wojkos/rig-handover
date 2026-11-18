import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

/** Parses one log line into a RunLine, or `null` when it is not one. */
export function parseRunLine(text: string): RunLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const { at, job, status, owner, error } = raw;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status, owner };
  if (error !== undefined) line.error = error;
  return line;
}

/** Folds one job's lines (already in `at` order, never empty) into its row. */
function toRow(job: string, lines: RunLine[]): DigestRow {
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  const withError = lines.findLast((l) => l.error !== undefined);
  return {
    job,
    owner: last.owner,
    runs: lines.length,
    retries: lines.filter((l) => l.status === 'retry').length,
    lastStatus: last.status,
    lastError: withError?.error ?? null,
    first: first.at,
    last: last.at,
  };
}

/** Builds a Night from the file's text. */
export function parseNight(night: string, text: string): Night {
  let badLines = 0;
  const byJob = new Map<string, RunLine[]>();
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim() === '') continue;
    const line = parseRunLine(rawLine);
    if (line === null) {
      badLines++;
      continue;
    }
    const list = byJob.get(line.job);
    if (list) list.push(line);
    else byJob.set(line.job, [line]);
  }
  const rows = [...byJob.entries()]
    .map(([job, lines]) => {
      // Order by instant (offsets may differ; stable for equal instants). Strings stay as written.
      const sorted = [...lines].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      return toRow(job, sorted);
    })
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  // Only plain dates name a night; anything else (e.g. `../x`) has no file.
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (isRecord(err) && (err.code === 'ENOENT' || err.code === 'EISDIR')) return null;
    throw err;
  }
  return parseNight(night, text);
};
