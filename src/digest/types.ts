// Plan morning-digest § 1. The contract every part of § 2 builds against.

/** One line of runs/<night>.jsonl, after parsing. */
export type RunStatus = 'ok' | 'retry' | 'fail';

export type RunLine = {
  /** ISO 8601 with the log's own offset. Never converted to UTC. */
  at: string;
  job: string;
  status: RunStatus;
  /** `null` is allowed: the row is kept and the owner shows as `—`. */
  owner: string | null;
  error?: string;
};

/** One row per job for the night. */
export type DigestRow = {
  job: string;
  /** Owner from the job's last line; `null` when the log has none. */
  owner: string | null;
  /** Lines for this job (ok + retry + fail). */
  runs: number;
  /** Lines with status `retry`. */
  retries: number;
  /** Status of the job's last line (by `at`). */
  lastStatus: RunStatus;
  /** `error` of the job's last line that had one; `null` if none did. */
  lastError: string | null;
  /** `at` of the job's first and last line, as written in the log. */
  first: string;
  last: string;
};

export type Night = {
  night: string;
  /** Sorted by job. Empty when the file is empty. */
  rows: DigestRow[];
  /** Lines that did not parse as a RunLine. Counted, never thrown. Blank lines are not counted. */
  badLines: number;
};

/**
 * Reads `<runsDir>/<night>.jsonl`.
 * Returns `null` when there is no file for that night (routes answer 404).
 * Never throws on bad lines.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
