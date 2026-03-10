---
title: "Bloat Detection and Remediation"
description: "Learn how to detect, measure, and fix table bloat using VACUUM, VACUUM FULL, pgstattuple, and pg_repack"
estimatedMinutes: 50
---

# Bloat Detection and Remediation

VACUUM reclaims dead tuple space for reuse within the table, but it does not return that space to the operating system. Over time, a table that experiences heavy UPDATE and DELETE activity can grow much larger than the actual live data requires. This excess space is called **bloat**, and managing it is one of the most common operational challenges with PostgreSQL.

## How Bloat Accumulates

Consider a table with 100,000 rows, each about 80 bytes. The table occupies roughly:

```
100,000 rows * ~100 bytes (including tuple header) / 8192 bytes per page ≈ 1,221 pages ≈ 10 MB
```

Now imagine you UPDATE every row three times:

1. First UPDATE: 100K old tuples become dead, 100K new tuples created. Table grows to ~20 MB.
2. VACUUM runs: marks dead tuples as free space. Table is still ~20 MB on disk.
3. New rows reuse the free space. Table stays at ~20 MB.
4. Second UPDATE: again 100K dead tuples. If free space is available, table stays ~20 MB. If not, it grows.
5. Third UPDATE without VACUUM: 200K dead tuples + 100K live. Table grows to ~30 MB.

Even after VACUUM cleans up all dead tuples, the table remains at ~30 MB. The 20 MB of "excess" space is **bloat** — PostgreSQL has marked those pages as available for reuse, but the file has not shrunk.

## Why VACUUM Doesn't Shrink Files

Standard VACUUM has a deliberate limitation: it only returns pages to the OS if they are at the **end** of the file and completely empty. If there is even one live tuple on the last page, the file cannot be truncated.

This is a design trade-off:
- **Pro**: VACUUM only needs a lightweight `ShareUpdateExclusiveLock` — it does not block reads or writes
- **Con**: Bloated tables stay bloated until you use more aggressive tools

```sql
-- Create a table and observe size growth
CREATE TABLE bloat_demo (id SERIAL, data TEXT);
INSERT INTO bloat_demo (data)
SELECT repeat('x', 100) FROM generate_series(1, 50000);

-- Check initial size
SELECT pg_size_pretty(pg_relation_size('bloat_demo')) AS initial_size;

-- Update every row (creates 50K dead tuples)
UPDATE bloat_demo SET data = repeat('y', 100);

-- Check size after update (roughly doubled)
SELECT pg_size_pretty(pg_relation_size('bloat_demo')) AS after_update;

-- VACUUM to reclaim dead space for reuse
VACUUM bloat_demo;

-- Check size after VACUUM (still the same!)
SELECT pg_size_pretty(pg_relation_size('bloat_demo')) AS after_vacuum;
```

The table size after VACUUM is approximately the same as after the update. The space is marked for reuse, but the file has not shrunk.

## Measuring Bloat

### Method 1: Comparing Sizes

A quick estimate compares the actual table size to the expected size based on live row count:

```sql
SELECT
  relname,
  pg_size_pretty(pg_relation_size(oid)) AS actual_size,
  pg_size_pretty(
    (reltuples * (
      SELECT avg(pg_column_size(bloat_demo.*))
      FROM bloat_demo
      LIMIT 1000
    ))::BIGINT
  ) AS estimated_live_size
FROM pg_class
WHERE relname = 'bloat_demo';
```

This is a rough estimate. For precise measurement, use `pgstattuple`.

### Method 2: pgstattuple Extension

The `pgstattuple` extension provides exact bloat measurements by scanning the table:

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;

SELECT
  table_len,
  tuple_count,
  tuple_len,
  tuple_percent,
  dead_tuple_count,
  dead_tuple_len,
  dead_tuple_percent,
  free_space,
  free_percent
FROM pgstattuple('bloat_demo');
```

Key metrics:
- **dead_tuple_count / dead_tuple_percent**: Tuples not yet vacuumed
- **free_space / free_percent**: Space reclaimed by VACUUM (available for reuse)
- **tuple_percent**: What fraction of the table contains actual live data

A healthy table has:
- `dead_tuple_percent` near 0 (VACUUM is doing its job)
- `free_percent` below 20-30% (table is not excessively bloated)

### Method 3: pg_stat_user_tables Estimates

For a quick check without scanning the whole table:

```sql
SELECT
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  CASE WHEN n_live_tup > 0
    THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
    ELSE 0
  END AS dead_pct,
  pg_size_pretty(pg_relation_size(relid)) AS table_size
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

Note: These are estimates based on the statistics collector. They may lag behind reality, especially on busy tables.

### Method 4: pgstattuple_approx

For large tables where a full `pgstattuple` scan is too expensive, use the approximate version:

```sql
SELECT
  table_len,
  scanned_percent,
  approx_tuple_count,
  approx_tuple_len,
  approx_tuple_percent,
  dead_tuple_count,
  dead_tuple_len,
  dead_tuple_percent,
  approx_free_space,
  approx_free_percent
FROM pgstattuple_approx('bloat_demo');
```

This reads the visibility map instead of scanning every page, making it much faster on large tables.

## Remediation: VACUUM FULL

`VACUUM FULL` rewrites the entire table, compacting it to the minimum size:

```sql
-- Check size before
SELECT pg_size_pretty(pg_relation_size('bloat_demo')) AS before_full;

-- Rewrite the table
VACUUM FULL bloat_demo;

-- Check size after
SELECT pg_size_pretty(pg_relation_size('bloat_demo')) AS after_full;
```

After `VACUUM FULL`, the table size drops to approximately the live data size.

### The Cost of VACUUM FULL

`VACUUM FULL` has severe operational implications:

| Aspect | VACUUM | VACUUM FULL |
|--------|--------|-------------|
| Lock | ShareUpdateExclusiveLock | **ACCESS EXCLUSIVE** |
| Reads blocked | No | **Yes** |
| Writes blocked | No | **Yes** |
| Duration | Proportional to dead tuples | Proportional to **entire table** |
| Space needed | In-place | **Temporary copy of entire table** |
| Indexes | Cleans dead entries | **Completely rebuilt** |

The ACCESS EXCLUSIVE lock means **all queries on the table are blocked** for the entire duration. On a large table, this can be minutes to hours.

Additionally, VACUUM FULL needs enough free disk space to hold a complete copy of the table plus its indexes.

## Remediation: pg_repack (Production Alternative)

`pg_repack` is a third-party extension that repacks tables online — without holding an exclusive lock for the entire operation:

```sql
-- Install the extension (if available)
CREATE EXTENSION pg_repack;
```

From the command line:

```bash
pg_repack -d mydb -t bloated_table
```

How it works:
1. Creates a new copy of the table
2. Sets up a trigger to capture changes to the original table during the copy
3. Applies captured changes to the new copy
4. Brief exclusive lock to swap the old and new tables
5. Drops the old table

The exclusive lock is held only for the final swap, typically milliseconds. This makes `pg_repack` suitable for production use.

### pg_repack vs VACUUM FULL

| Aspect | VACUUM FULL | pg_repack |
|--------|-------------|-----------|
| Lock duration | Entire operation | Brief swap only |
| Blocking | Yes, all queries | Minimal |
| Disk space | Full table copy | Full table copy |
| Index rebuild | Yes | Yes |
| Extension needed | No (built-in) | Yes (third-party) |
| Production safe | No (long locks) | Yes |

## Remediation: CLUSTER

The `CLUSTER` command rewrites a table ordered by an index:

```sql
CLUSTER bloat_demo USING bloat_demo_pkey;
```

Like `VACUUM FULL`, `CLUSTER` takes an ACCESS EXCLUSIVE lock and rewrites the entire table. The advantage is that data becomes physically ordered by the chosen index, which can improve range query performance. The disadvantages are the same as `VACUUM FULL`.

## Preventing Bloat

Prevention is better than remediation:

### 1. Tune Autovacuum for High-Churn Tables

Lower the scale factor so VACUUM runs more frequently:

```sql
ALTER TABLE high_churn_table SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 100
);
```

### 2. Use fillfactor for Updated Tables

Leave room for HOT updates, which reduce dead tuple generation:

```sql
ALTER TABLE updated_table SET (fillfactor = 80);
```

### 3. Batch Large Updates

Instead of updating millions of rows in one transaction, batch them:

```sql
-- Instead of: UPDATE big_table SET col = val;
-- Do batches:
UPDATE big_table SET col = val WHERE id BETWEEN 1 AND 10000;
VACUUM big_table;
UPDATE big_table SET col = val WHERE id BETWEEN 10001 AND 20000;
VACUUM big_table;
-- ...
```

This gives VACUUM a chance to clean up between batches.

### 4. Consider Partitioning

For tables with time-based data, partition by date and drop old partitions instead of deleting rows. Dropping a partition is instant and creates no dead tuples:

```sql
-- Instead of: DELETE FROM events WHERE created_at < '2024-01-01';
-- Use: ALTER TABLE events DETACH PARTITION events_2023;
--      DROP TABLE events_2023;
```

## Monitoring Bloat Over Time

Set up a regular bloat check (e.g., daily):

```sql
-- Quick bloat estimate for all tables
SELECT
  schemaname || '.' || relname AS table_name,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  n_dead_tup,
  n_live_tup,
  CASE WHEN n_live_tup > 0
    THEN round(100.0 * n_dead_tup / n_live_tup, 1)
    ELSE 0
  END AS dead_to_live_pct,
  last_autovacuum,
  last_vacuum
FROM pg_stat_user_tables
WHERE pg_relation_size(relid) > 10 * 1024 * 1024  -- Only tables > 10 MB
ORDER BY pg_relation_size(relid) DESC;
```

Tables to watch:
- `dead_to_live_pct > 20%`: Autovacuum may need tuning
- Table size growing without corresponding row count growth: Bloat accumulating
- `last_autovacuum` or `last_vacuum` is NULL or very old: VACUUM is not running

## Key Takeaways

- VACUUM marks dead tuple space for reuse but does not shrink the table file
- Table bloat occurs when free space exceeds what new rows can fill
- Use `pgstattuple` for precise bloat measurement, `pg_stat_user_tables` for estimates
- `VACUUM FULL` compacts the table but takes an ACCESS EXCLUSIVE lock (blocks everything)
- `pg_repack` is the production-safe alternative for online table compaction
- Prevention is better than cure: tune autovacuum, use fillfactor, batch updates, consider partitioning
- Monitor bloat trends over time to catch problems before they become critical

> **Real-World Example (Spare)**
>
> The `HardDelete` table (47 GB, ~74M rows) is Spare's audit trail for hard
> deletions — and it's itself a bloat candidate. Its index size (27 GB) exceeds
> the table data size (20 GB), meaning more than half the on-disk footprint is
> indexes. Tables that grow monotonically without updates (append-only audit logs)
> don't generate dead tuples, but they still need VACUUM for XID freezing, and
> their indexes can bloat from page splits.
>
> **Try It Yourself**: Open Metabase and run:
> ```sql
> SELECT relname,
>   pg_size_pretty(pg_relation_size(relid)) AS table_size,
>   pg_size_pretty(pg_indexes_size(relid)) AS index_size,
>   pg_size_pretty(pg_total_relation_size(relid)) AS total_size
> FROM pg_stat_user_tables
> WHERE relname = 'HardDelete';
> ```

In the next lesson, we will examine how VACUUM interacts with indexes, which have their own bloat dynamics.
