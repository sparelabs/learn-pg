---
title: Query Performance Tracking with pg_stat_statements
description: Master pg_stat_statements for identifying slow queries and performance bottlenecks
estimatedMinutes: 35
---

# Query Performance Tracking with pg_stat_statements

The `pg_stat_statements` extension is one of the most powerful tools for PostgreSQL performance monitoring. It tracks execution statistics for all SQL statements executed by the server, making it invaluable for identifying slow queries, optimization opportunities, and performance trends.

## Installation and Configuration

### Enable the Extension

```sql
-- Create the extension (requires superuser privileges)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify it's installed
SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements';
```

### Configuration Parameters

Add to `postgresql.conf`:

```ini
# Load the extension
shared_preload_libraries = 'pg_stat_statements'

# Number of statements to track (default 5000)
pg_stat_statements.max = 10000

# Track queries in nested statements (functions, procedures)
pg_stat_statements.track = 'all'

# Save statistics across server restarts
pg_stat_statements.save = on
```

After modifying `postgresql.conf`, restart PostgreSQL for changes to take effect.

## Understanding the Data

The `pg_stat_statements` view provides one row per distinct query (normalized):

### Key Columns

- **userid**: User who executed the query
- **dbid**: Database ID
- **queryid**: Hash of the normalized query
- **query**: Query text (normalized, with literals replaced by $1, $2, etc.)
- **calls**: Number of times executed
- **total_exec_time**: Total execution time (milliseconds)
- **mean_exec_time**: Average execution time
- **min_exec_time/max_exec_time**: Minimum and maximum execution times
- **stddev_exec_time**: Standard deviation of execution times
- **rows**: Total rows returned/affected
- **shared_blks_hit**: Blocks found in cache
- **shared_blks_read**: Blocks read from disk
- **shared_blks_written**: Blocks written to disk
- **temp_blks_read/written**: Temporary blocks (work_mem overflow)

## Essential Queries

### Top Queries by Total Time

```sql
-- Queries consuming the most total time
SELECT
  queryid,
  calls,
  round(total_exec_time::numeric, 2) AS total_time_ms,
  round(mean_exec_time::numeric, 2) AS mean_time_ms,
  round((100 * total_exec_time / SUM(total_exec_time) OVER ())::numeric, 2) AS percentage,
  LEFT(query, 80) AS query_preview
FROM pg_stat_statements
WHERE userid != 10  -- Exclude system user
ORDER BY total_exec_time DESC
LIMIT 20;
```

This identifies the queries that are consuming the most database time overall, making them prime candidates for optimization.

### Slowest Queries by Average Time

```sql
-- Queries with highest average execution time
SELECT
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_time_ms,
  round(max_exec_time::numeric, 2) AS max_time_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  LEFT(query, 80) AS query_preview
FROM pg_stat_statements
WHERE calls > 10  -- Filter out rare queries
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Most Frequently Called Queries

```sql
-- Queries executed most often
SELECT
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_time_ms,
  round(total_exec_time::numeric, 2) AS total_time_ms,
  rows,
  round((rows::numeric / calls)::numeric, 2) AS avg_rows,
  LEFT(query, 80) AS query_preview
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;
```

### Queries with High I/O

```sql
-- Queries doing the most disk reads
SELECT
  queryid,
  calls,
  shared_blks_read,
  shared_blks_hit,
  round(
    100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0),
    2
  ) AS cache_hit_ratio,
  round(mean_exec_time::numeric, 2) AS mean_time_ms,
  LEFT(query, 80) AS query_preview
FROM pg_stat_statements
WHERE shared_blks_read > 0
ORDER BY shared_blks_read DESC
LIMIT 20;
```

Low cache hit ratios indicate queries that might benefit from:
- Better indexing
- More memory (shared_buffers, work_mem)
- Query optimization

### Temporary Disk Usage

```sql
-- Queries using temporary disk space (work_mem overflow)
SELECT
  queryid,
  calls,
  temp_blks_read,
  temp_blks_written,
  pg_size_pretty((temp_blks_written * 8192)::bigint) AS temp_disk_usage,
  round(mean_exec_time::numeric, 2) AS mean_time_ms,
  LEFT(query, 80) AS query_preview
FROM pg_stat_statements
WHERE temp_blks_written > 0
ORDER BY temp_blks_written DESC
LIMIT 20;
```

Temporary disk usage indicates:
- Sorts that don't fit in work_mem
- Hash joins requiring disk spill
- Consider increasing work_mem for these queries

### Queries with High Variance

```sql
-- Queries with inconsistent performance
SELECT
  queryid,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_time_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  round(min_exec_time::numeric, 2) AS min_time_ms,
  round(max_exec_time::numeric, 2) AS max_time_ms,
  round((stddev_exec_time / NULLIF(mean_exec_time, 0))::numeric, 2) AS coefficient_of_variation,
  LEFT(query, 80) AS query_preview
FROM pg_stat_statements
WHERE calls > 10
  AND stddev_exec_time > 0
ORDER BY (stddev_exec_time / NULLIF(mean_exec_time, 0)) DESC
LIMIT 20;
```

High variance suggests:
- Different execution plans for different parameters
- Caching effects
- Lock contention
- Consider using EXPLAIN with actual parameters

## Query Normalization

PostgreSQL normalizes queries by replacing literal values with placeholders:

```sql
-- Original queries:
SELECT * FROM users WHERE id = 123;
SELECT * FROM users WHERE id = 456;

-- Stored as single normalized query:
SELECT * FROM users WHERE id = $1;
```

This allows aggregation of statistics across similar queries with different parameters.

## Performance Impact

`pg_stat_statements` has minimal overhead:
- Uses a fixed amount of shared memory
- Constant-time hash lookup
- Typically < 5% performance impact
- I/O timing (if enabled) adds 1-3% overhead

## Maintenance

### Reset Statistics

```sql
-- Reset all statement statistics
SELECT pg_stat_statements_reset();

-- Reset statistics for specific query
SELECT pg_stat_statements_reset(userid, dbid, queryid);
```

### Monitor Statement Limits

```sql
-- Check if we're hitting the statement limit
SELECT
  (SELECT COUNT(*) FROM pg_stat_statements) AS current_statements,
  current_setting('pg_stat_statements.max')::int AS max_statements;
```

If you're consistently at the limit, increase `pg_stat_statements.max`.

## Integration with Monitoring Tools

Create views for easier monitoring:

```sql
-- Create a view for top queries
CREATE VIEW top_queries AS
SELECT
  queryid,
  LEFT(query, 100) AS query_preview,
  calls,
  round(total_exec_time::numeric, 2) AS total_time_ms,
  round(mean_exec_time::numeric, 2) AS mean_time_ms,
  round((100 * total_exec_time / SUM(total_exec_time) OVER ())::numeric, 2) AS pct_total_time,
  rows,
  round(
    100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0),
    2
  ) AS cache_hit_ratio
FROM pg_stat_statements
WHERE total_exec_time > 0
ORDER BY total_exec_time DESC
LIMIT 50;
```

## Practical Workflow

1. **Identify expensive queries**: Start with total time
2. **Examine query text**: Get full query with `SELECT query FROM pg_stat_statements WHERE queryid = ?`
3. **Analyze execution plan**: Use EXPLAIN ANALYZE with representative parameters
4. **Optimize**: Add indexes, rewrite query, or adjust configuration
5. **Reset and monitor**: Reset stats, wait, and verify improvements

## Common Pitfalls

1. **Don't obsess over single execution queries**: Focus on frequently called or expensive queries
2. **Consider both total and mean time**: A query with 1M calls at 10ms costs more than one with 100 calls at 100ms
3. **Look at trends**: Compare statistics over time to catch degradation
4. **Parameter sniffing**: Normalized queries hide parameter-specific issues

## Best Practices

1. **Set appropriate max**: 10,000 statements is usually sufficient
2. **Enable track = 'all'**: Don't miss queries in functions
3. **Save across restarts**: Keep historical context
4. **Regular monitoring**: Review top queries weekly
5. **Alert on anomalies**: Set up alerts for sudden spikes in execution time
6. **Document baselines**: Know what's normal for your workload

## Next Steps

In the next lesson, we'll explore connection and lock monitoring to identify concurrency issues.
