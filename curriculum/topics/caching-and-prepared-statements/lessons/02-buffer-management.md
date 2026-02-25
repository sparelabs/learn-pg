---
title: Buffer Cache Management and Monitoring
description: Deep dive into monitoring cache performance and optimizing buffer usage
estimatedMinutes: 45
---

# Buffer Cache Management and Monitoring

Effective cache management is critical for PostgreSQL performance. This lesson covers how to monitor cache health, diagnose caching issues, and optimize buffer usage.

## Understanding Buffer Cache Metrics

### Cache Hit Ratio: The Primary Metric

Cache hit ratio tells you what percentage of page reads come from cache vs disk:

```sql
-- Database-level cache hit ratio
SELECT
    datname,
    blks_hit AS cache_hits,
    blks_read AS disk_reads,
    blks_hit + blks_read AS total_reads,
    ROUND(
        100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0),
        2
    ) AS cache_hit_ratio_percent
FROM pg_stat_database
WHERE datname = current_database();
```

**Example output**:
```
 datname  | cache_hits | disk_reads | total_reads | cache_hit_ratio_percent
----------+------------+------------+-------------+-------------------------
 mydb     | 98543210   | 1234567    | 99777777    | 98.76
```

**Target values**:
- **OLTP workload**: > 99%
- **Data warehouse**: > 95% (more sequential scans expected)
- **Mixed workload**: > 98%

### Table-Level Cache Statistics

See which tables are cache-friendly vs. cache-unfriendly:

```sql
SELECT
    schemaname,
    relname AS table_name,
    heap_blks_read AS disk_reads,
    heap_blks_hit AS cache_hits,
    heap_blks_hit + heap_blks_read AS total_reads,
    ROUND(
        100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0),
        2
    ) AS cache_hit_ratio,
    pg_size_pretty(pg_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) AS table_size
FROM pg_statio_user_tables
WHERE heap_blks_hit + heap_blks_read > 100  -- Meaningful sample size
ORDER BY heap_blks_read DESC
LIMIT 20;
```

**Interpretation**:
- **High disk reads + low ratio**: Table too large for cache, consider partitioning
- **High disk reads + high ratio**: Recently accessed, normal behavior
- **Low ratio + small table**: Should be fully cached, investigate queries

### Index Cache Statistics

Indexes should have very high cache hit ratios (typically > 99.5%):

```sql
SELECT
    schemaname,
    relname AS table_name,
    indexrelname AS index_name,
    idx_blks_read AS disk_reads,
    idx_blks_hit AS cache_hits,
    ROUND(
        100.0 * idx_blks_hit / NULLIF(idx_blks_hit + idx_blks_read, 0),
        2
    ) AS cache_hit_ratio,
    pg_size_pretty(pg_relation_size(quote_ident(schemaname)||'.'||quote_ident(indexrelname))) AS index_size
FROM pg_statio_user_indexes
WHERE idx_blks_hit + idx_blks_read > 0
ORDER BY idx_blks_read DESC
LIMIT 20;
```

Low cache hit ratio on indexes often indicates:
- Index too large to fit in shared buffers
- Index poorly designed (too many columns)
- Random access pattern on large index

## Detailed Cache Content Analysis

### Using pg_buffercache

The `pg_buffercache` extension lets you see exactly what's in shared buffers:

```sql
CREATE EXTENSION IF NOT EXISTS pg_buffercache;

-- What percentage of cache does each table occupy?
SELECT
    c.relname,
    COUNT(*) AS buffers,
    pg_size_pretty(COUNT(*) * 8192) AS cached_size,
    ROUND(100.0 * COUNT(*) / (
        SELECT setting::int FROM pg_settings WHERE name = 'shared_buffers'
    )::numeric, 2) AS percent_of_cache
FROM pg_buffercache b
    JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid)
WHERE b.reldatabase IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
GROUP BY c.relname
ORDER BY COUNT(*) DESC
LIMIT 20;
```

**Example output**:
```
     relname      | buffers | cached_size | percent_of_cache
------------------+---------+-------------+------------------
 users            |   45234 |     353 MB  |            34.52
 orders           |   23451 |     183 MB  |            17.89
 products         |   12345 |      96 MB  |             9.42
 users_pkey       |    8901 |      69 MB  |             6.79
```

### Cache Usage by Type

See how cache is split between tables, indexes, and other objects:

```sql
SELECT
    CASE
        WHEN c.relkind = 'r' THEN 'table'
        WHEN c.relkind = 'i' THEN 'index'
        WHEN c.relkind = 't' THEN 'toast'
        ELSE 'other'
    END AS object_type,
    COUNT(*) AS buffers,
    pg_size_pretty(COUNT(*) * 8192) AS cached_size,
    ROUND(100.0 * COUNT(*) / (
        SELECT setting::int FROM pg_settings WHERE name = 'shared_buffers'
    )::numeric, 2) AS percent_of_cache
FROM pg_buffercache b
    LEFT JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid)
WHERE b.reldatabase IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
GROUP BY object_type
ORDER BY buffers DESC;
```

**Ideal distribution** (varies by workload):
- Indexes: 30-50% (frequently accessed)
- Tables: 40-60% (hot data)
- TOAST: < 10% (large values)

### Dirty Buffer Analysis

Dirty buffers are modified pages not yet written to disk:

```sql
SELECT
    CASE
        WHEN isdirty THEN 'dirty'
        ELSE 'clean'
    END AS buffer_state,
    COUNT(*) AS buffers,
    pg_size_pretty(COUNT(*) * 8192) AS size
FROM pg_buffercache
GROUP BY buffer_state;
```

High dirty buffer count (> 20% of cache) may indicate:
- Heavy write workload
- Checkpoint/bgwriter not keeping up
- Need to tune checkpoint settings

## Monitoring Cache Performance Over Time

### Reset Statistics to Establish Baseline

```sql
-- Reset database statistics
SELECT pg_stat_reset();

-- Run workload for representative period (1 hour, 1 day)
-- Then check cache hit ratio
```

**Warning**: This clears all pg_stat counters. Use in development/testing only, or reset specific database:

```sql
SELECT pg_stat_reset_single_table_counters('schema.table'::regclass);
```

### Continuous Monitoring Query

Store this in a monitoring dashboard or cron job:

```sql
SELECT
    NOW() AS measured_at,
    datname,
    numbackends AS connections,
    xact_commit + xact_rollback AS total_transactions,
    blks_read AS disk_reads,
    blks_hit AS cache_hits,
    ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2) AS cache_hit_ratio,
    tup_returned AS rows_read,
    tup_fetched AS rows_fetched,
    tup_inserted + tup_updated + tup_deleted AS rows_modified
FROM pg_stat_database
WHERE datname = current_database();
```

Log this every 5-15 minutes to track trends.

## Diagnosing Cache Performance Issues

### Problem 1: Low Overall Cache Hit Ratio

**Symptoms**: Database-level cache hit ratio < 95%

**Diagnosis queries**:

```sql
-- Which tables are causing disk reads?
SELECT
    relname,
    heap_blks_read AS disk_reads,
    pg_size_pretty(pg_relation_size(relid)) AS size
FROM pg_statio_user_tables
WHERE heap_blks_read > 0
ORDER BY heap_blks_read DESC
LIMIT 10;
```

**Common causes**:
1. **shared_buffers too small** - Increase it
2. **Working set too large** - Data doesn't fit in memory
3. **Sequential scans on large tables** - Add indexes or partition
4. **Cache recently cleared** - Wait for warm-up

**Solutions**:
- Increase shared_buffers (up to 25% of RAM)
- Add indexes to reduce sequential scans
- Partition large tables to reduce working set
- Use pg_prewarm to warm cache after restart

### Problem 2: Specific Table Has Low Cache Ratio

**Symptoms**: One table has < 90% cache hit ratio while others are > 99%

**Diagnosis**:

```sql
SELECT
    relname,
    seq_scan AS sequential_scans,
    idx_scan AS index_scans,
    n_tup_ins + n_tup_upd + n_tup_del AS modifications,
    pg_size_pretty(pg_relation_size(relid)) AS table_size
FROM pg_stat_user_tables
WHERE relname = 'problematic_table';
```

**Common causes**:
1. **High sequential scans** - Table being scanned frequently
2. **Table too large** - Doesn't fit in cache
3. **Poor access pattern** - Random reads across entire table

**Solutions**:
- Create indexes to replace sequential scans
- Partition table by access pattern (e.g., date ranges)
- Increase shared_buffers if table is important and close to fitting
- Use partial indexes for common filters

### Problem 3: Cache Hit Ratio Drops Periodically

**Symptoms**: Cache ratio oscillates between 99% and 85% every few hours

**Diagnosis**:

```sql
-- Check for large tables being scanned
SELECT
    relname,
    seq_scan,
    last_seq_scan,
    pg_size_pretty(pg_relation_size(relid)) AS size
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY pg_relation_size(relid) DESC
LIMIT 10;
```

**Common causes**:
1. **Batch jobs** - ETL, reporting, backups running periodically
2. **Large sequential scans** - Evicting hot data from cache
3. **Maintenance operations** - VACUUM, ANALYZE, REINDEX

**Solutions**:
- Run batch jobs during off-hours
- Use buffer rings (automatic for VACUUM)
- Tune queries to use indexes instead of scans
- Increase shared_buffers to accommodate both working sets

### Problem 4: Index Not Cached Despite Heavy Use

**Symptoms**: Frequently used index has high disk reads

**Diagnosis**:

```sql
SELECT
    schemaname,
    indexrelname AS index_name,
    idx_scan AS index_scans,
    idx_tup_read AS tuples_read,
    pg_size_pretty(pg_relation_size(quote_ident(schemaname)||'.'||quote_ident(indexrelname))) AS index_size
FROM pg_stat_user_indexes
WHERE indexrelname = 'my_index';
```

**Common causes**:
1. **Index too large** - Doesn't fit in shared_buffers
2. **Index bloated** - Needs REINDEX
3. **Random access pattern** - OS cache isn't helping

**Solutions**:
- Check for index bloat: `SELECT * FROM pgstattuple('index_name');`
- REINDEX if bloated
- Consider partial index if only subset needed
- Increase shared_buffers
- For very large indexes, use BRIN instead of B-tree if applicable

## Optimizing Buffer Usage

### Strategy 1: Prioritize Hot Data

Use pg_prewarm to keep critical data cached:

```sql
-- Warm critical tables at startup
SELECT pg_prewarm('users', 'main');
SELECT pg_prewarm('products', 'main');

-- Warm important indexes
SELECT pg_prewarm('users_pkey', 'main');
SELECT pg_prewarm('users_email_idx', 'main');
```

Add to a startup script or run periodically.

### Strategy 2: Partition Large Tables

Partitioning reduces the working set:

```sql
-- Instead of one 500GB table
-- Create monthly partitions

CREATE TABLE orders_2024_01 PARTITION OF orders
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE orders_2024_02 PARTITION OF orders
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
```

Queries with date filters only load relevant partitions into cache.

### Strategy 3: Use Partial Indexes

If queries filter on specific values, use partial indexes:

```sql
-- Instead of indexing all rows
CREATE INDEX users_active_email_idx ON users(email) WHERE status = 'active';

-- Index is much smaller, easier to cache
-- Only used for active users
```

### Strategy 4: Adjust Configuration for Workload

**For OLTP** (many small transactions):
```
shared_buffers = 8GB       # Larger cache
random_page_cost = 1.1     # SSD-optimized
effective_cache_size = 24GB # Large cache hint
```

**For Analytics** (large scans, aggregations):
```
shared_buffers = 4GB       # Smaller, more for work_mem
work_mem = 256MB           # Larger per-operation memory
random_page_cost = 1.1
effective_cache_size = 30GB
```

### Strategy 5: Monitor and Iterate

Create a monitoring routine:

```sql
-- Save as monitor_cache.sql
\timing on

SELECT 'Cache Hit Ratio' AS metric, ROUND(100.0 * SUM(blks_hit) / NULLIF(SUM(blks_hit + blks_read), 0), 2)::text || '%' AS value
FROM pg_stat_database
WHERE datname = current_database()

UNION ALL

SELECT 'Dirty Buffers', COUNT(*)::text
FROM pg_buffercache WHERE isdirty

UNION ALL

SELECT 'Unused Buffers', COUNT(*)::text
FROM pg_buffercache WHERE relfilenode IS NULL;
```

Run regularly and alert if cache hit ratio drops below threshold.

## Cache Warming After Restart

PostgreSQL cache is not persistent - after restart, it's empty.

### Automatic Warming Script

Create a script to run after PostgreSQL starts:

```sql
-- warm_cache.sql
\timing on

-- Critical tables
SELECT pg_prewarm('users');
SELECT pg_prewarm('products');
SELECT pg_prewarm('orders');

-- Critical indexes
SELECT pg_prewarm('users_pkey');
SELECT pg_prewarm('products_pkey');
SELECT pg_prewarm('orders_user_id_idx');
SELECT pg_prewarm('orders_created_at_idx');

SELECT 'Cache warming completed' AS status;
```

Run via cron or systemd after PostgreSQL startup:

```bash
psql -d mydb -f warm_cache.sql
```

### Intelligent Warming

Record what was cached before shutdown:

```sql
-- Before shutdown: save cached relations
COPY (
    SELECT c.relname
    FROM pg_buffercache b
        JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid)
    WHERE b.reldatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
    GROUP BY c.relname
    HAVING COUNT(*) > 100  -- Only significantly cached objects
    ORDER BY COUNT(*) DESC
) TO '/tmp/cached_objects.txt';

-- After startup: reload
CREATE TEMP TABLE cached_objects (relname text);
COPY cached_objects FROM '/tmp/cached_objects.txt';

DO $$
DECLARE
    obj RECORD;
BEGIN
    FOR obj IN SELECT relname FROM cached_objects LOOP
        PERFORM pg_prewarm(obj.relname);
    END LOOP;
END$$;
```

## Key Takeaways

- Monitor **cache hit ratio** regularly (target > 99% for OLTP)
- Use **pg_buffercache** to see what's cached
- Investigate **tables with high disk reads** for optimization opportunities
- **Indexes should be almost fully cached** (> 99.5% hit ratio)
- Warm cache after restart using **pg_prewarm**
- **Partition large tables** to reduce working set size
- Use **partial indexes** to keep indexes smaller and more cacheable
- Tune **shared_buffers** based on workload (15-25% of RAM)
- Monitor **dirty buffers** to ensure bgwriter/checkpointer keeping up
- Create **monitoring dashboards** to track cache performance over time

Effective cache management can improve query performance by 10-100x. Understanding these metrics and techniques is essential for maintaining a high-performance PostgreSQL database.

In the next lesson, we'll explore prepared statements and how they provide both performance and security benefits.
