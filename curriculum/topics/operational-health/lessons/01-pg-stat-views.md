---
title: Understanding pg_stat_* Views
description: Learn about PostgreSQL's built-in statistics views for monitoring database activity
estimatedMinutes: 30
---

# Understanding pg_stat_* Views

PostgreSQL provides a comprehensive set of statistics views that track various aspects of database activity. These views are part of the statistics collector subsystem and are essential for monitoring, troubleshooting, and optimizing your database.

## The Statistics Collector

The statistics collector is a PostgreSQL subsystem that collects and reports information about server activity. It runs as a separate process and accumulates statistics that can be queried through various system views.

### Key Configuration

```sql
-- Check if statistics collection is enabled
SHOW track_activities;
SHOW track_counts;
SHOW track_io_timing;
```

These settings control what statistics are collected:
- `track_activities`: Tracks currently executing commands
- `track_counts`: Tracks row access statistics
- `track_io_timing`: Tracks I/O timing (adds overhead, use carefully)

## pg_stat_activity

This view shows one row per server process, displaying information about current activity.

### Important Columns

- **datname**: Database name
- **pid**: Process ID of this backend
- **usename**: User name
- **application_name**: Application that connected
- **client_addr**: Client IP address
- **state**: Current state (active, idle, idle in transaction)
- **query**: Currently executing query
- **query_start**: When the current query began
- **state_change**: When the state last changed
- **wait_event_type**: Type of event the backend is waiting for
- **wait_event**: Event name the backend is waiting for

### Example Queries

```sql
-- View all active queries
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  query,
  age(clock_timestamp(), query_start) AS query_duration
FROM pg_stat_activity
WHERE state = 'active'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start;

-- Count connections by state
SELECT
  state,
  COUNT(*) as count
FROM pg_stat_activity
GROUP BY state
ORDER BY count DESC;

-- Find long-running queries (> 5 minutes)
SELECT
  pid,
  usename,
  query_start,
  now() - query_start AS duration,
  query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '5 minutes'
ORDER BY duration DESC;
```

## pg_stat_database

This view shows database-wide statistics, one row per database.

### Key Metrics

- **numbackends**: Number of backends currently connected
- **xact_commit**: Number of transactions committed
- **xact_rollback**: Number of transactions rolled back
- **blks_read**: Number of disk blocks read
- **blks_hit**: Number of buffer hits (blocks found in cache)
- **tup_returned**: Rows returned by queries
- **tup_fetched**: Rows fetched by queries
- **tup_inserted/updated/deleted**: DML operation counts
- **conflicts**: Number of queries canceled due to conflicts
- **deadlocks**: Number of deadlocks detected

### Example Queries

```sql
-- Database overview with cache hit ratio
SELECT
  datname,
  numbackends,
  xact_commit,
  xact_rollback,
  blks_read,
  blks_hit,
  round(
    100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0),
    2
  ) AS cache_hit_ratio,
  tup_returned,
  tup_fetched,
  tup_inserted,
  tup_updated,
  tup_deleted,
  deadlocks
FROM pg_stat_database
WHERE datname IS NOT NULL
ORDER BY datname;

-- Transaction commit ratio
SELECT
  datname,
  xact_commit,
  xact_rollback,
  round(
    100.0 * xact_commit / NULLIF(xact_commit + xact_rollback, 0),
    2
  ) AS commit_ratio
FROM pg_stat_database
WHERE datname IS NOT NULL;
```

## pg_stat_user_tables

This view shows statistics for each user table, essential for understanding table usage patterns.

### Key Metrics

- **seq_scan**: Number of sequential scans
- **seq_tup_read**: Rows read by sequential scans
- **idx_scan**: Number of index scans
- **idx_tup_fetch**: Rows fetched by index scans
- **n_tup_ins/upd/del**: Insert/update/delete counts
- **n_tup_hot_upd**: HOT (Heap-Only Tuple) updates
- **n_live_tup**: Estimated live rows
- **n_dead_tup**: Estimated dead rows
- **last_vacuum**: Last time table was vacuumed
- **last_autovacuum**: Last time table was auto-vacuumed
- **last_analyze**: Last time table was analyzed

### Example Queries

```sql
-- Tables with most sequential scans
SELECT
  schemaname,
  relname,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup
FROM pg_stat_user_tables
ORDER BY seq_scan DESC
LIMIT 10;

-- Tables needing vacuum (high dead tuple ratio)
SELECT
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  round(
    100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0),
    2
  ) AS dead_ratio,
  last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY dead_ratio DESC;

-- HOT update ratio (higher is better)
SELECT
  schemaname,
  relname,
  n_tup_upd,
  n_tup_hot_upd,
  round(
    100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0),
    2
  ) AS hot_update_ratio
FROM pg_stat_user_tables
WHERE n_tup_upd > 0
ORDER BY hot_update_ratio ASC
LIMIT 10;
```

## pg_stat_user_indexes

Shows statistics for each user index, helping identify unused or inefficient indexes.

### Key Metrics

- **idx_scan**: Number of index scans
- **idx_tup_read**: Tuples read from index
- **idx_tup_fetch**: Live tuples fetched

### Example Queries

```sql
-- Unused indexes (candidates for removal)
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Most used indexes
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC
LIMIT 10;
```

## Resetting Statistics

Statistics can be reset if needed:

```sql
-- Reset all statistics for current database
SELECT pg_stat_reset();

-- Reset statistics for a specific table
SELECT pg_stat_reset_single_table_counters('table_name'::regclass);
```

**Warning**: Only reset statistics when you have a specific reason, as historical data is valuable for trend analysis.

## Best Practices

1. **Monitor regularly**: Set up automated monitoring to track key metrics over time
2. **Establish baselines**: Know what normal looks like for your workload
3. **Cache hit ratio**: Aim for 95%+ cache hit ratio
4. **Dead tuples**: Monitor and ensure autovacuum is working effectively
5. **Sequential scans**: Large seq_scan counts on big tables may indicate missing indexes
6. **Index usage**: Unused indexes waste space and slow down writes

## Next Steps

In the next lesson, we'll explore pg_stat_statements, which provides detailed query-level performance tracking.
