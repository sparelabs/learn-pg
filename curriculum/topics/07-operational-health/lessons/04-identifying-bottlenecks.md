---
title: Identifying Slow Queries and Bottlenecks
description: Learn systematic approaches to finding and diagnosing performance problems
estimatedMinutes: 35
---

# Identifying Slow Queries and Bottlenecks

Performance problems rarely announce themselves clearly. This lesson covers systematic approaches to identifying slow queries, understanding bottlenecks, and gathering the information needed for optimization.

## The Performance Investigation Process

### 1. Define the Problem

Before diving into diagnostics, clearly define what "slow" means:
- Is the entire application slow?
- Are specific queries slow?
- Is it slow all the time or only during peak hours?
- How slow is acceptable vs. unacceptable?

### 2. Gather Evidence

Use multiple data sources:
- Application metrics
- PostgreSQL logs
- pg_stat_statements
- System resource monitoring

### 3. Form Hypotheses

Based on evidence, hypothesize causes:
- Missing indexes
- Poor query plans
- Lock contention
- Resource constraints (CPU, memory, I/O)
- Configuration issues

### 4. Test and Validate

Verify hypotheses with targeted investigation.

## Identifying Slow Queries

### Using pg_stat_statements

The most reliable method for production systems:

```sql
-- Queries with highest total time (overall impact)
SELECT
  queryid,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  round((100 * total_exec_time / SUM(total_exec_time) OVER ())::numeric, 2) AS pct_time,
  LEFT(query, 100) AS query_preview
FROM pg_stat_statements
WHERE calls > 10
ORDER BY total_exec_time DESC
LIMIT 20;

-- Queries with highest mean time (individual slowness)
SELECT
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(max_exec_time::numeric, 2) AS max_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  LEFT(query, 100) AS query_preview
FROM pg_stat_statements
WHERE calls > 5
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Using Real-Time Monitoring

Catch queries in the act:

```sql
-- Queries currently running over 5 seconds
SELECT
  pid,
  now() - query_start AS duration,
  usename,
  query,
  state
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '5 seconds'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;
```

### Using PostgreSQL Logs

Enable slow query logging in `postgresql.conf`:

```ini
# Log queries slower than this threshold
log_min_duration_statement = 1000  # milliseconds

# Log all queries (for debugging only - very verbose)
# log_statement = 'all'

# Include execution plans for slow queries
auto_explain.log_min_duration = 1000
auto_explain.log_analyze = on
auto_explain.log_buffers = on
```

## Analyzing Query Performance

Once you've identified a slow query, analyze it systematically:

### 1. Get the Full Query Text

```sql
-- Get complete query from pg_stat_statements
SELECT query
FROM pg_stat_statements
WHERE queryid = 1234567890;
```

### 2. Use EXPLAIN ANALYZE

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, TIMING)
SELECT ...;
```

Key metrics to look for:
- **Execution Time**: Total time taken
- **Planning Time**: Time to generate the plan
- **Seq Scan on large tables**: Missing indexes
- **Buffer usage**: I/O patterns
- **Rows estimates vs. actual**: Statistics issues

### 3. Check for Missing Indexes

```sql
-- Sequential scans on large tables
SELECT
  schemaname,
  relname,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_live_tup,
  pg_size_pretty(pg_relation_size(relid)) AS table_size
FROM pg_stat_user_tables
WHERE seq_scan > 0
  AND n_live_tup > 10000
  AND seq_scan > idx_scan
ORDER BY seq_tup_read DESC
LIMIT 20;
```

### 4. Examine Index Usage

```sql
-- Indexes that are never used
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Low selectivity indexes (might not be helpful)
SELECT
  schemaname,
  tablename,
  attname,
  n_distinct,
  most_common_vals
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct < 10
ORDER BY n_distinct;
```

## Common Bottlenecks

### Cache Performance Issues

```sql
-- Database-level cache hit ratio
SELECT
  datname,
  blks_hit,
  blks_read,
  round(
    100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0),
    2
  ) AS cache_hit_ratio
FROM pg_stat_database
WHERE datname = current_database();
```

Target: 95%+ cache hit ratio

If low:
- Increase `shared_buffers`
- Add indexes to reduce sequential scans
- Review query patterns

### Table Bloat

Dead tuples slow down queries:

```sql
-- Tables with significant bloat
SELECT
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

If bloat is high:
- Check autovacuum settings
- Run VACUUM manually
- Consider increasing `autovacuum_max_workers`

### Index Bloat

```sql
-- Estimate index bloat
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;
```

Fix with REINDEX:

```sql
REINDEX INDEX CONCURRENTLY index_name;
```

### Work Memory Spills

Queries using temporary disk space:

```sql
-- Queries spilling to disk
SELECT
  queryid,
  calls,
  temp_blks_written,
  pg_size_pretty((temp_blks_written * 8192)::bigint) AS temp_size,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  LEFT(query, 100) AS query_preview
FROM pg_stat_statements
WHERE temp_blks_written > 0
ORDER BY temp_blks_written DESC
LIMIT 20;
```

Solutions:
- Increase `work_mem` for specific queries
- Add indexes to reduce sort/hash size
- Rewrite query to be more efficient

### Long-Running Transactions

```sql
-- Long-running transactions blocking vacuum
SELECT
  pid,
  usename,
  application_name,
  backend_start,
  xact_start,
  query_start,
  state_change,
  state,
  age(now(), xact_start) AS xact_duration,
  age(now(), query_start) AS query_duration,
  query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
  AND age(now(), xact_start) > interval '5 minutes'
ORDER BY xact_start;
```

### Lock Contention

```sql
-- Time spent waiting for locks
SELECT
  wait_event_type,
  wait_event,
  COUNT(*) AS waiting_queries,
  SUM(EXTRACT(epoch FROM (now() - query_start))) AS total_wait_seconds
FROM pg_stat_activity
WHERE wait_event_type = 'Lock'
  AND state = 'active'
GROUP BY wait_event_type, wait_event
ORDER BY total_wait_seconds DESC;
```

## Resource Bottlenecks

### CPU Bottlenecks

Signs of CPU bottlenecks:
- High CPU usage (> 80% sustained)
- Long query times without I/O waits
- Many active queries competing for CPU

```sql
-- CPU-intensive queries (low I/O, high execution time)
SELECT
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  shared_blks_hit + shared_blks_read AS total_blks,
  round(
    100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0),
    2
  ) AS cache_hit_ratio,
  LEFT(query, 100) AS query_preview
FROM pg_stat_statements
WHERE shared_blks_hit + shared_blks_read > 0
  AND mean_exec_time > 100
ORDER BY mean_exec_time DESC;
```

### I/O Bottlenecks

Signs of I/O bottlenecks:
- Disk I/O wait times
- Low cache hit ratio
- High disk read/write rates

```sql
-- I/O heavy queries
SELECT
  queryid,
  calls,
  shared_blks_read,
  shared_blks_hit,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(
    100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0),
    2
  ) AS cache_hit_ratio,
  LEFT(query, 100) AS query_preview
FROM pg_stat_statements
WHERE shared_blks_read > 1000
ORDER BY shared_blks_read DESC;
```

### Memory Bottlenecks

Signs of memory bottlenecks:
- Frequent temp file creation
- Swap usage
- OOM (Out of Memory) errors

```sql
-- Check memory settings
SELECT
  name,
  setting,
  unit,
  context
FROM pg_settings
WHERE name IN (
  'shared_buffers',
  'work_mem',
  'maintenance_work_mem',
  'effective_cache_size'
);
```

## Performance Baseline

Establish baselines to detect degradation:

```sql
-- Create a performance snapshot table
CREATE TABLE performance_snapshots (
  snapshot_time TIMESTAMP DEFAULT now(),
  metric_name TEXT,
  metric_value NUMERIC,
  details JSONB
);

-- Regular snapshot of key metrics
INSERT INTO performance_snapshots (metric_name, metric_value, details)
SELECT
  'cache_hit_ratio',
  round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2),
  jsonb_build_object(
    'database', datname,
    'blks_hit', blks_hit,
    'blks_read', blks_read
  )
FROM pg_stat_database
WHERE datname = current_database();
```

## Investigation Checklist

When investigating performance issues:

1. **Identify the slow query**
   - Check pg_stat_statements
   - Review application logs
   - Monitor pg_stat_activity

2. **Analyze the query**
   - Run EXPLAIN ANALYZE
   - Check for seq scans on large tables
   - Review row estimates vs. actual

3. **Check indexes**
   - Are appropriate indexes present?
   - Are indexes being used?
   - Are statistics up to date?

4. **Review resource usage**
   - CPU utilization
   - Memory usage
   - I/O patterns
   - Cache hit ratios

5. **Look for contention**
   - Lock waits
   - Blocking queries
   - Connection pool exhaustion

6. **Check table health**
   - Bloat levels
   - Last vacuum/analyze
   - Dead tuple ratio

## Best Practices

1. **Monitor proactively**: Don't wait for problems
2. **Establish baselines**: Know what's normal
3. **Log slow queries**: Keep historical data
4. **Update statistics**: Run ANALYZE regularly
5. **Test in production-like environments**: Load testing matters
6. **One change at a time**: Isolate what fixes issues
7. **Document findings**: Build institutional knowledge

## Next Steps

In the next lesson, we'll create comprehensive health check queries and set up alerting for production monitoring.
