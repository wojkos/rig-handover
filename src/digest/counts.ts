import { readFileSync } from 'node:fs';
import type { RunStatus } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

// Line counts by status. Rows can't give exact ok vs fail lines, so read the file.
// Bad lines are skipped, blank lines ignored. `null` when the file can't be read.
export function countNight(runsDir: string, night: string): NightCounts | null {
  let text: string;
  try {
    text = readFileSync(`${runsDir}/${night}.jsonl`, 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const v: unknown = JSON.parse(line);
      if (typeof v !== 'object' || v === null) continue;
      const r = v as Record<string, unknown>;
      if (typeof r.at !== 'string' || typeof r.job !== 'string') continue;
      if (typeof r.status !== 'string' || !STATUSES.includes(r.status)) continue;
      if (r.owner !== undefined && r.owner !== null && typeof r.owner !== 'string') continue;
      counts[r.status as RunStatus] += 1;
    } catch {
      continue;
    }
  }
  return counts;
}
