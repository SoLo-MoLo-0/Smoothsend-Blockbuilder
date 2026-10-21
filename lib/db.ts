import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'node:module';
import { Pool } from 'pg';

const req = createRequire(import.meta.url || process.cwd() + '/');

let sqliteInstance: any = null;
let pgPoolInstance: Pool | null = null;
let pgInitPromise: Promise<void> | null = null;

export interface RunRow {
  run_id: string;
  player: string;
  day: number;
  mode: 'daily' | 'practice';
  started_at: number;
  submitted_at: number | null;
  ticks: number | null;
  score: number | null;
  lines: number | null;
  epochs: number | null;
  log_hash: string | null;
  deadline: number | null;
  signature: string | null;
  input_log: string | null;
  status: 'started' | 'completed' | 'invalid';
  tx_hash?: string | null;
}

export function isPostgres(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(url && (url.startsWith('postgres://') || url.startsWith('postgresql://')));
}

function getPgPool(): Pool {
  if (pgPoolInstance) return pgPoolInstance;
  const connectionString = process.env.DATABASE_URL!;
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  pgPoolInstance = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
  });

  return pgPoolInstance;
}

async function ensurePgTables(): Promise<void> {
  if (pgInitPromise) return pgInitPromise;

  pgInitPromise = (async () => {
    const pool = getPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_seeds (
        day INTEGER PRIMARY KEY,
        seed INTEGER NOT NULL,
        salt TEXT NOT NULL,
        committed_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        player TEXT NOT NULL,
        day INTEGER NOT NULL,
        mode TEXT NOT NULL,
        started_at BIGINT NOT NULL,
        submitted_at BIGINT,
        ticks INTEGER,
        score INTEGER,
        lines INTEGER,
        epochs INTEGER,
        log_hash TEXT,
        deadline BIGINT,
        signature TEXT,
        input_log TEXT,
        status TEXT NOT NULL,
        tx_hash TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_runs_day_player ON runs(day, player);
      CREATE INDEX IF NOT EXISTS idx_runs_day_score ON runs(day, score DESC);
    `);
  })();

  return pgInitPromise;
}

export function getDb(): any {
  if (isPostgres()) {
    return getPgPool();
  }

  if (sqliteInstance) return sqliteInstance;

  const { DatabaseSync } = req('node:sqlite');
  const isVercel = Boolean(process.env.VERCEL);
  const dataDir = isVercel ? '/tmp' : path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'runs.db');
  if (isVercel && !fs.existsSync(dbPath)) {
    const seedPath = path.resolve(process.cwd(), 'data', 'runs.db');
    if (fs.existsSync(seedPath)) {
      try {
        fs.copyFileSync(seedPath, dbPath);
      } catch (err) {
        console.warn('Could not copy seed DB to /tmp:', err);
      }
    }
  }

  sqliteInstance = new DatabaseSync(dbPath);

  sqliteInstance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `);

  sqliteInstance.exec(`
    CREATE TABLE IF NOT EXISTS daily_seeds (
      day INTEGER PRIMARY KEY,
      seed INTEGER NOT NULL,
      salt TEXT NOT NULL,
      committed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      player TEXT NOT NULL,
      day INTEGER NOT NULL,
      mode TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      submitted_at INTEGER,
      ticks INTEGER,
      score INTEGER,
      lines INTEGER,
      epochs INTEGER,
      log_hash TEXT,
      deadline INTEGER,
      signature TEXT,
      input_log TEXT,
      status TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_runs_day_player ON runs(day, player);
    CREATE INDEX IF NOT EXISTS idx_runs_day_score ON runs(day, score DESC);
  `);

  try {
    sqliteInstance.exec('ALTER TABLE runs ADD COLUMN tx_hash TEXT;');
  } catch {}

  return sqliteInstance;
}

const seedMemoryCache = new Map<number, { day: number; seed: number; salt: string }>();

export function getDailySeed(day: number): { day: number; seed: number; salt: string } | null {
  if (seedMemoryCache.has(day)) {
    return seedMemoryCache.get(day)!;
  }
  if (!isPostgres()) {
    try {
      const db = getDb();
      const stmt = db.prepare('SELECT day, seed, salt FROM daily_seeds WHERE day = ?');
      const row = stmt.get(day) as { day: number; seed: number; salt: string } | undefined;
      if (row) {
        seedMemoryCache.set(day, row);
        return row;
      }
    } catch {}
  }
  return null;
}

export async function getAllDailySeeds(): Promise<{ day: number; seed: number; salt: string; committed_at: number }[]> {
  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    const res = await pool.query('SELECT day, seed, salt, committed_at FROM daily_seeds ORDER BY day ASC');
    return res.rows.map((r) => ({ ...r, committed_at: Number(r.committed_at) }));
  }
  const db = getDb();
  const stmt = db.prepare('SELECT day, seed, salt, committed_at FROM daily_seeds ORDER BY day ASC');
  return stmt.all() as { day: number; seed: number; salt: string; committed_at: number }[];
}

export function setDailySeed(day: number, seed: number, salt: string): void {
  seedMemoryCache.set(day, { day, seed, salt });
  if (isPostgres()) {
    ensurePgTables().then(() => {
      getPgPool()
        .query(
          `
          INSERT INTO daily_seeds (day, seed, salt, committed_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT(day) DO UPDATE SET seed = EXCLUDED.seed, salt = EXCLUDED.salt
        `,
          [day, seed, salt, Date.now()]
        )
        .catch(() => {});
    });
    return;
  }
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO daily_seeds (day, seed, salt, committed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET seed = excluded.seed, salt = excluded.salt
    `);
    stmt.run(day, seed, salt, Date.now());
  } catch {}
}

export async function createRunSession(
  runId: string,
  player: string,
  day: number,
  mode: 'daily' | 'practice',
  startedAt: number
): Promise<void> {
  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    await pool.query(
      `
      INSERT INTO runs (run_id, player, day, mode, started_at, status)
      VALUES ($1, $2, $3, $4, $5, 'started')
      ON CONFLICT (run_id) DO NOTHING
    `,
      [runId, player.toLowerCase(), day, mode, startedAt]
    );
    return;
  }
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO runs (run_id, player, day, mode, started_at, status)
    VALUES (?, ?, ?, ?, ?, 'started')
  `);
  stmt.run(runId, player.toLowerCase(), day, mode, startedAt);
}

function normalizeRunRow(row: any): RunRow {
  return {
    run_id: row.run_id,
    player: row.player,
    day: Number(row.day),
    mode: row.mode,
    started_at: Number(row.started_at),
    submitted_at: row.submitted_at != null ? Number(row.submitted_at) : null,
    ticks: row.ticks != null ? Number(row.ticks) : null,
    score: row.score != null ? Number(row.score) : null,
    lines: row.lines != null ? Number(row.lines) : null,
    epochs: row.epochs != null ? Number(row.epochs) : null,
    log_hash: row.log_hash,
    deadline: row.deadline != null ? Number(row.deadline) : null,
    signature: row.signature,
    input_log: row.input_log,
    status: row.status,
    tx_hash: row.tx_hash,
  };
}

export async function getRun(runId: string): Promise<RunRow | null> {
  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    const res = await pool.query('SELECT * FROM runs WHERE run_id = $1', [runId]);
    return res.rows[0] ? normalizeRunRow(res.rows[0]) : null;
  }
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM runs WHERE run_id = ?');
  const row = stmt.get(runId) as RunRow | undefined;
  return row ? normalizeRunRow(row) : null;
}

export async function getPlayerDailyRun(player: string, day: number): Promise<RunRow | null> {
  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    const res = await pool.query(
      `
      SELECT * FROM runs
      WHERE LOWER(player) = LOWER($1) AND day = $2 AND mode = 'daily' AND status = 'completed'
      ORDER BY submitted_at DESC
      LIMIT 1
    `,
      [player, day]
    );
    return res.rows[0] ? normalizeRunRow(res.rows[0]) : null;
  }
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM runs
    WHERE player = ? AND day = ? AND mode = 'daily' AND status = 'completed'
    ORDER BY submitted_at DESC
    LIMIT 1
  `);
  const row = stmt.get(player.toLowerCase(), day) as RunRow | undefined;
  return row ? normalizeRunRow(row) : null;
}

export async function updateRunCompleted(
  runId: string,
  result: {
    player?: string;
    submittedAt: number;
    ticks: number;
    score: number;
    lines: number;
    epochs: number;
    logHash: string;
    deadline: number;
    signature: string;
    inputLog: string;
  }
): Promise<void> {
  const resolvedPlayer =
    result.player && result.player !== '0x0000000000000000000000000000000000000000'
      ? result.player.toLowerCase()
      : null;

  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    await pool.query(
      `
      UPDATE runs
      SET player = COALESCE($1, player),
          submitted_at = $2,
          ticks = $3,
          score = $4,
          lines = $5,
          epochs = $6,
          log_hash = $7,
          deadline = $8,
          signature = $9,
          input_log = $10,
          status = 'completed'
      WHERE run_id = $11
    `,
      [
        resolvedPlayer,
        result.submittedAt,
        result.ticks,
        result.score,
        result.lines,
        result.epochs,
        result.logHash,
        result.deadline,
        result.signature,
        result.inputLog,
        runId,
      ]
    );
    return;
  }

  const db = getDb();
  const stmt = db.prepare(`
    UPDATE runs
    SET player = COALESCE(?, player),
        submitted_at = ?,
        ticks = ?,
        score = ?,
        lines = ?,
        epochs = ?,
        log_hash = ?,
        deadline = ?,
        signature = ?,
        input_log = ?,
        status = 'completed'
    WHERE run_id = ?
  `);
  stmt.run(
    resolvedPlayer,
    result.submittedAt,
    result.ticks,
    result.score,
    result.lines,
    result.epochs,
    result.logHash,
    result.deadline,
    result.signature,
    result.inputLog,
    runId
  );
}

export async function getTopRun(day: number): Promise<RunRow | null> {
  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    const res = await pool.query(
      `
      SELECT * FROM runs
      WHERE day = $1 AND mode = 'daily' AND status = 'completed'
      ORDER BY score DESC, submitted_at ASC
      LIMIT 1
    `,
      [day]
    );
    return res.rows[0] ? normalizeRunRow(res.rows[0]) : null;
  }
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM runs
    WHERE day = ? AND mode = 'daily' AND status = 'completed'
    ORDER BY score DESC, submitted_at ASC
    LIMIT 1
  `);
  const row = stmt.get(day) as RunRow | undefined;
  return row ? normalizeRunRow(row) : null;
}

export async function upsertCompletedRun(run: {
  runId?: string;
  player: string;
  day: number;
  mode?: 'daily' | 'practice';
  submittedAt: number;
  ticks?: number;
  score: number;
  lines: number;
  epochs?: number;
  logHash?: string;
  deadline?: number;
  signature?: string;
  inputLog?: string;
  txHash?: string;
}): Promise<void> {
  const id = run.runId || `run_${run.day}_${run.player.toLowerCase()}`;

  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    await pool.query(
      `
      INSERT INTO runs (
        run_id, player, day, mode, started_at, submitted_at,
        ticks, score, lines, epochs, log_hash, deadline, signature, input_log, status, tx_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'completed', $15)
      ON CONFLICT(run_id) DO UPDATE SET
        player = EXCLUDED.player,
        score = GREATEST(runs.score, EXCLUDED.score),
        submitted_at = EXCLUDED.submitted_at,
        status = 'completed',
        tx_hash = COALESCE(EXCLUDED.tx_hash, runs.tx_hash)
    `,
      [
        id,
        run.player.toLowerCase(),
        run.day,
        run.mode || 'daily',
        run.submittedAt - 240000,
        run.submittedAt,
        run.ticks ?? 14400,
        run.score,
        run.lines,
        run.epochs ?? 0,
        run.logHash ?? '',
        run.deadline ?? 0,
        run.signature ?? '',
        run.inputLog ?? '[]',
        run.txHash ?? null,
      ]
    );
    return;
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO runs (run_id, player, day, mode, started_at, submitted_at, ticks, score, lines, epochs, log_hash, deadline, signature, input_log, status, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
    ON CONFLICT(run_id) DO UPDATE SET
      player = excluded.player,
      score = MAX(runs.score, excluded.score),
      submitted_at = excluded.submitted_at,
      status = 'completed',
      tx_hash = COALESCE(excluded.tx_hash, runs.tx_hash)
  `);
  stmt.run(
    id,
    run.player.toLowerCase(),
    run.day,
    run.mode || 'daily',
    run.submittedAt - 240000,
    run.submittedAt,
    run.ticks ?? 14400,
    run.score,
    run.lines,
    run.epochs ?? 0,
    run.logHash ?? '',
    run.deadline ?? 0,
    run.signature ?? '',
    run.inputLog ?? '[]',
    run.txHash ?? null
  );
}

export async function updateRunTxHash(params: {
  runId?: string;
  player?: string;
  day?: number;
  txHash: string;
}): Promise<void> {
  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    try {
      if (params.runId) {
        await pool.query('UPDATE runs SET tx_hash = $1 WHERE run_id = $2', [params.txHash, params.runId]);
      }
      if (params.player && params.day !== undefined) {
        await pool.query('UPDATE runs SET tx_hash = $1 WHERE LOWER(player) = LOWER($2) AND day = $3', [
          params.txHash,
          params.player,
          params.day,
        ]);
      }
    } catch (err) {
      console.warn('Could not update run tx_hash in Postgres:', err);
    }
    return;
  }

  const db = getDb();
  try {
    if (params.runId) {
      db.prepare('UPDATE runs SET tx_hash = ? WHERE run_id = ?').run(params.txHash, params.runId);
    }
    if (params.player && params.day !== undefined) {
      db.prepare('UPDATE runs SET tx_hash = ? WHERE LOWER(player) = LOWER(?) AND day = ?').run(
        params.txHash,
        params.player,
        params.day
      );
    }
  } catch (err) {
    console.warn('Could not update run tx_hash:', err);
  }
}

export async function getDayStats(day: number): Promise<{
  count: number;
  bestScore: number;
  avgScore: number;
  avgLines: number;
  medianScore: number;
  scores: number[];
  funStat: string;
}> {
  let rows: { score: number; lines: number; ticks: number; epochs: number }[];

  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    const res = await pool.query(
      `
      SELECT score, lines, ticks, epochs FROM runs
      WHERE day = $1 AND mode = 'daily' AND status = 'completed'
      ORDER BY score DESC
    `,
      [day]
    );
    rows = res.rows.map((r) => ({
      score: Number(r.score) || 0,
      lines: Number(r.lines) || 0,
      ticks: Number(r.ticks) || 0,
      epochs: Number(r.epochs) || 0,
    }));
  } else {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT score, lines, ticks, epochs FROM runs
      WHERE day = ? AND mode = 'daily' AND status = 'completed'
      ORDER BY score DESC
    `);
    rows = stmt.all(day) as { score: number; lines: number; ticks: number; epochs: number }[];
  }

  if (!rows || rows.length === 0) {
    return {
      count: 0,
      bestScore: 0,
      avgScore: 0,
      avgLines: 0,
      medianScore: 0,
      scores: [],
      funStat: "Set the first benchmark on today's piece bag.",
    };
  }

  const scores = rows.map((r) => r.score || 0);
  const linesList = rows.map((r) => r.lines || 0);
  const totalScore = scores.reduce((sum, s) => sum + s, 0);
  const totalLines = linesList.reduce((sum, l) => sum + l, 0);
  const avgScore = Math.round(totalScore / scores.length);
  const avgLines = Math.round(totalLines / scores.length);
  const medianScore = scores[Math.floor(scores.length / 2)] || 0;

  const earlyTopOutCount = rows.filter((r) => (r.score || 0) < 500).length;
  const earlyPct = Math.round((earlyTopOutCount / rows.length) * 100);

  let funStat = '';
  if (rows.length >= 2 && earlyPct >= 30) {
    funStat = `${earlyPct}% of players also topped out early on today's pieces.`;
  } else if (rows.length >= 2 && avgLines > 0) {
    funStat = `Community average: ${avgScore.toLocaleString()} pts across ${rows.length} completed runs today.`;
  } else if (rows.length >= 2) {
    funStat = `Tough sequence today: median score is ${medianScore.toLocaleString()} pts.`;
  } else {
    funStat = `First verified score of day No. ${day} locked in on Avalanche.`;
  }

  return {
    count: scores.length,
    bestScore: scores[0],
    avgScore,
    avgLines,
    medianScore,
    scores,
    funStat,
  };
}

export async function getDailyLeaderboard(day: number): Promise<RunRow[]> {
  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    const res = await pool.query(
      `
      SELECT * FROM runs
      WHERE day = $1 AND mode = 'daily' AND status = 'completed'
        AND player IS NOT NULL
        AND player != '0x0000000000000000000000000000000000000000'
        AND length(player) = 42
        AND player LIKE '0x%'
      ORDER BY score DESC, submitted_at ASC
    `,
      [day]
    );
    return res.rows.map(normalizeRunRow);
  }

  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM runs
    WHERE day = ? AND mode = 'daily' AND status = 'completed'
      AND player IS NOT NULL
      AND player != '0x0000000000000000000000000000000000000000'
      AND length(player) = 42
      AND player LIKE '0x%'
    ORDER BY score DESC, submitted_at ASC
  `);
  const rows = stmt.all(day) as RunRow[];
  return rows.map(normalizeRunRow);
}

export async function getAllTimeLeaderboard(): Promise<
  {
    player: string;
    score: number;
    day: number;
    lines: number;
    submitted_at: number;
    ticks: number | null;
    tx_hash?: string | null;
  }[]
> {
  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    const res = await pool.query(`
      SELECT player, MAX(score) as score, MAX(day) as day, MAX(lines) as lines, MAX(submitted_at) as submitted_at, MAX(ticks) as ticks, MAX(tx_hash) as tx_hash
      FROM runs
      WHERE mode = 'daily' AND status = 'completed'
        AND player IS NOT NULL
        AND player != '0x0000000000000000000000000000000000000000'
        AND length(player) = 42
        AND player LIKE '0x%'
      GROUP BY player
      ORDER BY score DESC
      LIMIT 50
    `);
    return res.rows.map((r) => ({
      player: r.player,
      score: Number(r.score),
      day: Number(r.day),
      lines: Number(r.lines),
      submitted_at: Number(r.submitted_at),
      ticks: r.ticks != null ? Number(r.ticks) : null,
      tx_hash: r.tx_hash,
    }));
  }

  const db = getDb();
  const stmt = db.prepare(`
    SELECT player, MAX(score) as score, day, lines, submitted_at, ticks, tx_hash
    FROM runs
    WHERE mode = 'daily' AND status = 'completed'
      AND player IS NOT NULL
      AND player != '0x0000000000000000000000000000000000000000'
      AND length(player) = 42
      AND player LIKE '0x%'
    GROUP BY player
    ORDER BY score DESC
    LIMIT 50
  `);
  return stmt.all() as any[];
}

export async function getStreaksLeaderboard(): Promise<
  {
    player: string;
    streak: number;
    last_day: number;
  }[]
> {
  let rows: { player: string; day: number }[];

  if (isPostgres()) {
    await ensurePgTables();
    const pool = getPgPool();
    const res = await pool.query(`
      SELECT DISTINCT player, day
      FROM runs
      WHERE mode = 'daily' AND status = 'completed'
        AND player IS NOT NULL
        AND player != '0x0000000000000000000000000000000000000000'
        AND length(player) = 42
        AND player LIKE '0x%'
      ORDER BY player, day ASC
    `);
    rows = res.rows.map((r) => ({ player: r.player, day: Number(r.day) }));
  } else {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT DISTINCT player, day
      FROM runs
      WHERE mode = 'daily' AND status = 'completed'
        AND player IS NOT NULL
        AND player != '0x0000000000000000000000000000000000000000'
        AND length(player) = 42
        AND player LIKE '0x%'
      ORDER BY player, day ASC
    `);
    rows = stmt.all() as { player: string; day: number }[];
  }

  const playerDays = new Map<string, number[]>();
  for (const r of rows) {
    if (!playerDays.has(r.player)) playerDays.set(r.player, []);
    playerDays.get(r.player)!.push(r.day);
  }

  const results: { player: string; streak: number; last_day: number }[] = [];
  for (const [player, days] of playerDays.entries()) {
    days.sort((a, b) => a - b);
    let currentStreak = 1;
    let maxStreak = 1;
    for (let i = 1; i < days.length; i++) {
      if (days[i] === days[i - 1] + 1) {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else if (days[i] !== days[i - 1]) {
        currentStreak = 1;
      }
    }
    results.push({ player, streak: maxStreak, last_day: days[days.length - 1] });
  }

  return results.sort((a, b) => b.streak - a.streak);
}
