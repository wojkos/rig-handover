import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

let runsDir: string;
const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

const good = (job: string, owner: string | null = 'rook') =>
  JSON.stringify({ at: '2026-11-01T01:00:00+01:00', job, status: 'ok', owner });

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-'));
  fs.copyFileSync(path.resolve('runs/2026-10-28.jsonl'), path.join(runsDir, '2026-10-28.jsonl'));
  fs.writeFileSync(path.join(runsDir, '2026-11-02.jsonl'), '');
  fs.writeFileSync(
    path.join(runsDir, '2026-11-03.jsonl'),
    [good('alpha/job'), 'not json at all', good('beta/job')].join('\n') + '\n',
  );
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

type Body = { night: string; rows: DigestRow[]; badLines: number };

describe.each([
  ['page', '/digest/'],
  ['json', '/api/digest/'],
])('digest %s', (kind, prefix) => {
  it('404 for a night with no file', async () => {
    const res = await app().request(`${prefix}2020-01-01`);
    expect(res.status).toBe(404);
  });

  it('empty night answers 200 with no rows', async () => {
    const res = await app().request(`${prefix}2026-11-02`);
    expect(res.status).toBe(200);
    if (kind === 'json') {
      const body = (await res.json()) as Body;
      expect(body.rows).toEqual([]);
      expect(body.badLines).toBe(0);
    } else {
      expect(await res.text()).toContain('nothing ran');
    }
  });

  it('a bad line does not break the night', async () => {
    const res = await app().request(`${prefix}2026-11-03`);
    expect(res.status).toBe(200);
    if (kind === 'json') {
      const body = (await res.json()) as Body;
      expect(body.badLines).toBeGreaterThanOrEqual(1);
      expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'beta/job']);
    } else {
      const html = await res.text();
      expect(html).toContain('alpha/job');
      expect(html).toContain('beta/job');
    }
  });
});

describe('night with data (2026-10-28)', () => {
  it('JSON has 5 jobs and one bad line', async () => {
    const res = await app().request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.night).toBe('2026-10-28');
    expect(body.rows).toHaveLength(5);
    expect(body.badLines).toBe(1);
  });

  it('HTML has every job and the lane banner', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const body = (await (await app().request('/api/digest/2026-10-28')).json()) as Body;
    const res = await app().request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const row of body.rows) expect(html).toContain(row.job);
    expect(html).toContain('lane-07');
    expect(html).toContain('TEST-MARKER');
  });

  it('page and JSON list jobs in the same order', async () => {
    const body = (await (await app().request('/api/digest/2026-10-28')).json()) as Body;
    const html = await (await app().request('/digest/2026-10-28')).text();
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('owner null renders as an em dash', async () => {
    const body = (await (await app().request('/api/digest/2026-10-28')).json()) as Body;
    const row = body.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
    const html = await (await app().request('/digest/2026-10-28')).text();
    expect(html).toContain('—');
  });
});
