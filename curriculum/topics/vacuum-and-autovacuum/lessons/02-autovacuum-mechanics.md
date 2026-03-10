---
title: "Autovacuum Mechanics"
description: "Learn how the autovacuum daemon decides when to vacuum tables, how workers are scheduled, and how to monitor autovacuum activity"
estimatedMinutes: 45
---

# Autovacuum Mechanics

PostgreSQL does not require you to manually run VACUUM after every batch of updates. The **autovacuum daemon** runs in the background, automatically identifying tables that need vacuuming and performing the cleanup. Understanding how autovacuum makes its decisions is critical for keeping your database healthy.

## The Autovacuum Daemon

The autovacuum system consists of:

1. **Autovacuum launcher**: A single background process that periodically wakes up and checks which tables need vacuuming
2. **Autovacuum workers**: Separate processes (up to `autovacuum_max_workers`, default 3) that perform the actual VACUUM or ANALYZE operations

The launcher wakes up every `autovacuum_naptime` seconds (default: 60) and scans `pg_stat_user_tables` to find tables that have accumulated enough dead tuples to warrant vacuuming.

```sql
-- Check autovacuum configuration
SHOW autovacuum;                    -- on/off
SHOW autovacuum_naptime;            -- how often launcher checks (seconds)
SHOW autovacuum_max_workers;        -- max concurrent workers
SHOW autovacuum_vacuum_threshold;   -- base dead tuple threshold
SHOW autovacuum_vacuum_scale_factor; -- fraction of table size
```

## The Trigger Formula

Autovacuum decides to vacuum a table when:

```
dead tuples > vacuum_threshold + (scale_factor * reltuples)
```

With default settings:

- `autovacuum_vacuum_threshold` = 50
- `autovacuum_vacuum_scale_factor` = 0.2

So the formula becomes:

```
dead tuples > 50 + (0.2 * reltuples)
```

**Examples**:
- A table with 100 rows triggers vacuum after 50 + 20 = **70** dead tuples
- A table with 10,000 rows triggers after 50 + 2,000 = **2,050** dead tuples
- A table with 1,000,000 rows triggers after 50 + 200,000 = **200,050** dead tuples

The scale factor means that larger tables tolerate proportionally more dead tuples before autovacuum kicks in. This is often too lenient for very large tables — a million-row table must accumulate 200,000 dead tuples (20% of the table!) before autovacuum runs.

## Monitoring Dead Tuples

The `pg_stat_user_tables` view is your primary window into autovacuum status:

```sql
SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  last_vacuum,
  last_autovacuum,
  vacuum_count,
  autovacuum_count
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

Key columns:
- **n_live_tup**: Estimated count of live rows
- **n_dead_tup**: Estimated count of dead tuples waiting to be vacuumed
- **last_vacuum**: Timestamp of last manual VACUUM
- **last_autovacuum**: Timestamp of last automatic VACUUM
- **vacuum_count / autovacuum_count**: Total number of vacuum operations

### Checking if a Table Needs Vacuuming

You can compute whether a table has crossed the autovacuum threshold:

```sql
SELECT
  schemaname,
  relname,
  n_dead_tup,
  n_live_tup,
  n_dead_tup > (
    current_setting('autovacuum_vacuum_threshold')::INTEGER
    + current_setting('autovacuum_vacuum_scale_factor')::NUMERIC * n_live_tup
  ) AS needs_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC;
```

## Autovacuum for ANALYZE

Autovacuum also triggers ANALYZE to update table statistics. The formula is similar:

```
modified tuples > analyze_threshold + (analyze_scale_factor * reltuples)
```

Default settings:
- `autovacuum_analyze_threshold` = 50
- `autovacuum_analyze_scale_factor` = 0.1

ANALYZE runs more frequently than VACUUM (10% vs 20% scale factor) because stale statistics can cause the query planner to choose bad plans.

```sql
SELECT
  relname,
  n_mod_since_analyze,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_mod_since_analyze DESC;
```

## Worker Scheduling and Resource Control

### Worker Limits

With `autovacuum_max_workers = 3` (default), at most three tables can be vacuumed simultaneously. If you have hundreds of tables with dead tuples, workers process them one by one, round-robin style.

In a database with many busy tables, this can create a bottleneck. You can increase the worker count:

```sql
SHOW autovacuum_max_workers;
-- To change: ALTER SYSTEM SET autovacuum_max_workers = 5;
-- Requires restart
```

### I/O Throttling (Cost-Based Vacuum Delay)

VACUUM operations generate I/O that competes with normal queries. PostgreSQL throttles autovacuum using a cost-based delay system:

```sql
SHOW autovacuum_vacuum_cost_delay;  -- Default: 2ms (sleep this long)
SHOW autovacuum_vacuum_cost_limit;  -- Default: -1 (uses vacuum_cost_limit = 200)
SHOW vacuum_cost_page_hit;          -- Default: 1 (cost for a cached page)
SHOW vacuum_cost_page_miss;         -- Default: 2 (cost for a disk read) — changed to 2 in PG 17
SHOW vacuum_cost_page_dirty;        -- Default: 20 (cost for dirtying a page)
```

The mechanism:
1. Autovacuum worker processes pages, accumulating "cost" points
2. When cost reaches `vacuum_cost_limit` (200), the worker sleeps for `autovacuum_vacuum_cost_delay` (2ms)
3. After sleeping, the cost counter resets and the worker resumes

This means autovacuum is deliberately slow to avoid impacting production queries. On modern SSDs, the defaults are often too conservative — autovacuum spends most of its time sleeping.

### Calculating Autovacuum Speed

With defaults (cost limit 200, delay 2ms, miss cost 2):

- Per cycle: 200 / 2 = 100 page misses (uncached reads)
- Cycles per second: 1000 / 2 = 500
- Pages per second: 100 * 500 = 50,000 pages = ~390 MB/s

This sounds fast, but in practice autovacuum also dirties pages (cost 20 each), which reduces throughput dramatically. On a table with many dead tuples to clean, the effective rate might be closer to 10-20 MB/s.

## Monitoring Autovacuum in Progress

PostgreSQL 9.6+ provides a progress view for currently-running VACUUM operations:

```sql
SELECT
  p.pid,
  a.query,
  p.datname,
  p.relid::regclass AS table_name,
  p.phase,
  p.heap_blks_total,
  p.heap_blks_scanned,
  p.heap_blks_vacuumed,
  CASE WHEN p.heap_blks_total > 0
    THEN round(100.0 * p.heap_blks_vacuumed / p.heap_blks_total, 1)
    ELSE 0
  END AS pct_complete,
  p.index_vacuum_count,
  p.max_dead_tuples
FROM pg_stat_progress_vacuum p
JOIN pg_stat_activity a ON a.pid = p.pid;
```

The phases are:
1. **initializing**: Setting up
2. **scanning heap**: Reading pages to find dead tuples
3. **vacuuming indexes**: Removing index entries pointing to dead tuples
4. **vacuuming heap**: Marking dead tuples as free space
5. **cleaning up indexes**: Final index cleanup pass
6. **truncating heap**: Attempting to return trailing empty pages to the OS
7. **performing final cleanup**: Updating statistics and the free space map

## Manual VACUUM

You can run VACUUM manually at any time:

```sql
-- Basic VACUUM: mark dead tuples as reusable space
VACUUM my_table;

-- VACUUM with VERBOSE output
VACUUM VERBOSE my_table;

-- VACUUM and update statistics in one command
VACUUM ANALYZE my_table;
```

Manual VACUUM uses the same mechanism as autovacuum but runs with the calling session's priority (no cost-based delay by default, unless `vacuum_cost_delay` is set).

### VACUUM VERBOSE Output

```sql
VACUUM VERBOSE employees;
```

```
INFO:  vacuuming "public.employees"
INFO:  table "employees": found 500 removable, 1000 nonremovable row versions in 10 out of 20 pages
DETAIL:  0 dead row versions cannot be removed yet.
500 tuples are dead but not yet removable.
There were 100 unused item identifiers.
```

This tells you:
- How many dead tuples were reclaimed (removable)
- How many pages were scanned
- Whether any dead tuples could not be removed (held by a long-running transaction)

## Statistics Reset

The counters in `pg_stat_user_tables` accumulate over time. You can reset them to get a fresh baseline:

```sql
-- Reset statistics for all tables
SELECT pg_stat_reset();

-- After some time, check again to see fresh vacuum activity
SELECT
  relname,
  n_dead_tup,
  last_autovacuum,
  autovacuum_count
FROM pg_stat_user_tables;
```

Use this when debugging autovacuum behavior — reset, wait, then observe.

## Common Autovacuum Problems

### 1. Autovacuum Can't Keep Up

Symptoms: `n_dead_tup` keeps growing, `last_autovacuum` is far in the past.

Causes:
- Too few workers for the number of active tables
- Cost-based delay is too aggressive (too much sleeping)
- A long-running transaction is preventing tuple cleanup (covered in Lesson 7)

### 2. Autovacuum Never Runs on a Table

Symptoms: `autovacuum_count = 0` despite the table having dead tuples.

Causes:
- Dead tuple count has not exceeded the threshold formula
- Autovacuum is disabled on the table (`ALTER TABLE SET (autovacuum_enabled = false)`)
- All workers are busy on other tables

### 3. Autovacuum Causes I/O Spikes

Symptoms: Periodic disk I/O spikes correlating with autovacuum runs.

Causes:
- Large tables that rarely cross the threshold accumulate massive dead tuple counts
- When autovacuum finally runs, it processes hundreds of thousands of dead tuples at once
- Solution: Lower the threshold/scale factor so autovacuum runs more frequently with less work each time

## Autovacuum Logging

Enable logging to track autovacuum activity:

```sql
SHOW log_autovacuum_min_duration;
-- Default: 10min in PG 17+ (previously -1, disabled)
-- Set to 0 to log every autovacuum run
-- ALTER SYSTEM SET log_autovacuum_min_duration = 0;
```

This logs when autovacuum starts and finishes, including how many tuples it processed and how long it took. Essential for diagnosing autovacuum problems in production.

## Key Takeaways

- The autovacuum daemon automatically identifies and vacuums tables that accumulate dead tuples
- The trigger formula is: `dead_tuples > threshold + (scale_factor * reltuples)`
- Default settings (20% scale factor) can be too lenient for large tables
- Autovacuum workers share a global cost limit and sleep to throttle I/O
- Monitor autovacuum with `pg_stat_user_tables` and `pg_stat_progress_vacuum`
- Manual VACUUM runs without cost-based delay by default
- Enable `log_autovacuum_min_duration` in production to track activity

In the next lesson, we will learn how to tune autovacuum settings on a per-table basis for tables with different workload patterns.
