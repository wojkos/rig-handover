import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('reads 5 jobs and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows).toHaveLength(5);
    expect(night?.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries for fixtures/refresh', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      first: '2026-10-29T01:30:00+01:00',
      last: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the failure of notes/backup', () => {
    expect(row('notes/backup')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('keeps digest/render with owner null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('lane/sync counts only valid lines and keeps times as written', () => {
    expect(row('lane/sync')).toMatchObject({
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      first: '2026-10-28T23:00:06+01:00',
      last: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (lines: string[]) => writeFileSync(join(dir, '2026-01-01.jsonl'), lines.join('\n'));
  const line = (o: Record<string, unknown>) => JSON.stringify(o);
  const at = '2026-01-01T01:00:00+01:00';

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    expect(readNight(dir, '../etc')).toBeNull();
  });

  it('empty file: no rows, no bad lines', () => {
    write([]);
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('ignores blank lines and counts every kind of bad line', () => {
    write([
      '',
      '   ',
      '{not json',
      'null',
      '[1,2]',
      line({ job: 'a', status: 'ok', owner: 'x' }), // no at
      line({ at: 'yesterday', job: 'a', status: 'ok', owner: 'x' }), // bad at
      line({ at, status: 'ok', owner: 'x' }), // no job
      line({ at, job: 'a', status: 'done', owner: 'x' }), // bad status
      line({ at, job: 'a', status: 'ok' }), // owner missing
      line({ at, job: 'a', status: 'ok', owner: 7 }), // owner not a string
      line({ at, job: 'a', status: 'fail', owner: 'x', error: 42 }), // error not a string
      line({ at, job: 'a', status: 'ok', owner: 'x' }),
      '',
    ]);
    const night = readNight(dir, '2026-01-01');
    expect(night?.badLines).toBe(10);
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]?.runs).toBe(1);
  });

  it('orders a job by at, keeps offsets as written, owner from the last line', () => {
    write([
      line({ at: '2026-01-01T03:00:00+02:00', job: 'j', status: 'fail', owner: 'mid', error: 'boom' }), // 01:00Z
      line({ at: '2026-01-01T00:30:00Z', job: 'j', status: 'retry', owner: 'early', error: 'first' }), // 00:30Z
      line({ at: '2026-01-01T01:30:00+00:00', job: 'j', status: 'ok', owner: null }), // 01:30Z
    ]);
    expect(readNight(dir, '2026-01-01')?.rows[0]).toEqual({
      job: 'j',
      owner: null,
      runs: 3,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'boom',
      first: '2026-01-01T00:30:00Z',
      last: '2026-01-01T01:30:00+00:00',
    });
  });
});
