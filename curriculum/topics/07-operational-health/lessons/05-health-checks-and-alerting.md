---
title: Health Check Queries and Alerting
description: Build comprehensive health monitoring and alerting for production PostgreSQL
estimatedMinutes: 40
---

# Health Check Queries and Alerting

Production PostgreSQL databases require continuous monitoring to detect problems before they impact users. This lesson covers building comprehensive health checks and setting up effective alerting.

## Health Check Principles

### Effective Health Checks Should Be:

1. **Fast**: Execute in milliseconds, not seconds
2. **Non-intrusive**: Minimal impact on production
3. **Actionable**: Clear indication of what's wrong
4. **Measurable**: Numeric thresholds for alerting
5. **Comprehensive**: Cover all critical aspects

### Monitoring Frequency

- **Critical checks**: Every 15-30 seconds (connections, replication lag)
- **Performance checks**: Every 1-5 minutes (slow queries, cache hit ratio)
- **Resource checks**: Every 5-15 minutes (bloat, disk space)
- **Health checks**: Every 15-60 minutes (statistics age, index health)

## Connection Health

### Connection Count Monitoring

```sql
-- Connection utilization check
WITH connection_stats AS (
  SELECT
    COUNT(*) AS current_connections,
    current_setting('max_connections')::int AS max_connections,
    current_setting('superuser_reserved_connections')::int AS reserved_connections
)
SELECT
  current_connections,
  max_connections - reserved_connections AS available_connections,
  round(
    100.0 * current_connections / (max_connections - reserved_connections),
    2
  ) AS utilization_pct,
  CASE
    WHEN current_connections >= (max_connections - reserved_connections) * 0.95
      THEN 'CRITICAL'
    WHEN current_connections >= (max_connections - reserved_connections) * 0.80
      THEN 'WARNING'
    ELSE 'OK'
  END AS status
FROM connection_stats;
```

Alert thresholds:
- WARNING: > 80% of available connections
- CRITICAL: > 95% of available connections

### Idle in Transaction Monitoring

```sql
-- Dangerous idle in transaction connections
SELECT
  COUNT(*) AS idle_in_transaction_count,
  MAX(age(now(), state_change)) AS max_idle_duration,
  CASE
    WHEN MAX(EXTRACT(epoch FROM age(now(), state_change))) > 600
      THEN 'CRITICAL'
    WHEN MAX(EXTRACT(epoch FROM age(now(), state_change))) > 300
      THEN 'WARNING'
    WHEN COUNT(*) > 0
      THEN 'INFO'
    ELSE 'OK'
  END AS status
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND backend_type = 'client backend';
```

Alert thresholds:
- INFO: Any idle in transaction connections
- WARNING: Idle > 5 minutes
- CRITICAL: Idle > 10 minutes

## Database Health

### Database Is Accepting Connections

```sql
-- Basic connectivity check
SELECT
  datname,
  CASE
    WHEN datallowconn THEN 'OK'
    ELSE 'CRITICAL'
  END AS status
FROM pg_database
WHERE datname = current_database();
```

### Transaction ID Wraparound

```sql
-- Check for approaching transaction ID wraparound
SELECT
  datname,
  age(datfrozenxid) AS xid_age,
  2147483648 - age(datfrozenxid) AS xids_remaining,
  round(100.0 * age(datfrozenxid) / 2147483648, 2) AS pct_towards_wraparound,
  CASE
    WHEN age(datfrozenxid) > 1800000000 THEN 'CRITICAL'
    WHEN age(datfrozenxid) > 1500000000 THEN 'WARNING'
    ELSE 'OK'
  END AS status
FROM pg_database
WHERE datname = current_database();
```

Alert thresholds:
- WARNING: > 1.5 billion transactions
- CRITICAL: > 1.8 billion transactions

### Replication Lag (for replicas)

```sql
-- Replication lag in seconds
SELECT
  now() - pg_last_xact_replay_timestamp() AS replication_lag,
  CASE
    WHEN pg_is_in_recovery() = false THEN 'N/A - PRIMARY'
    WHEN now() - pg_last_xact_replay_timestamp() > interval '60 seconds'
      THEN 'CRITICAL'
    WHEN now() - pg_last_xact_replay_timestamp() > interval '30 seconds'
      THEN 'WARNING'
    ELSE 'OK'
  END AS status;
```

## Performance Health

### Cache Hit Ratio

```sql
-- Cache hit ratio check
SELECT
  round(
    100.0 * sum(blks_hit) / NULLIF(sum(blks_hit) + sum(blks_read), 0),
    2
  ) AS cache_hit_ratio,
  CASE
    WHEN sum(blks_hit) + sum(blks_read) = 0 THEN 'NO DATA'
    WHEN sum(blks_hit)::float / NULLIF(sum(blks_hit) + sum(blks_read), 0) < 0.90
      THEN 'CRITICAL'
    WHEN sum(blks_hit)::float / NULLIF(sum(blks_hit) + sum(blks_read), 0) < 0.95
      THEN 'WARNING'
    ELSE 'OK'
  END AS status
FROM pg_stat_database
WHERE datname = current_database();
```

Alert thresholds:
- WARNING: < 95% cache hit ratio
- CRITICAL: < 90% cache hit ratio

### Slow Query Detection

```sql
-- Currently running slow queries
SELECT
  COUNT(*) AS slow_query_count,
  MAX(EXTRACT(epoch FROM (now() - query_start))) AS max_duration_seconds,
  CASE
    WHEN MAX(EXTRACT(epoch FROM (now() - query_start))) > 300
      THEN 'CRITICAL'
    WHEN MAX(EXTRACT(epoch FROM (now() - query_start))) > 60
      THEN 'WARNING'
    WHEN COUNT(*) > 0
      THEN 'INFO'
    ELSE 'OK'
  END AS status
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '10 seconds'
  AND query NOT LIKE '%pg_stat_activity%';
```

### Blocking Queries

```sql
-- Number of blocked queries
WITH blocked AS (
  SELECT blocked_locks.pid
  FROM pg_locks blocked_locks
  JOIN pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
  WHERE NOT blocked_locks.granted
)
SELECT
  COUNT(*) AS blocked_query_count,
  CASE
    WHEN COUNT(*) > 10 THEN 'CRITICAL'
    WHEN COUNT(*) > 5 THEN 'WARNING'
    WHEN COUNT(*) > 0 THEN 'INFO'
    ELSE 'OK'
  END AS status
FROM blocked;
```

## Table Health

### Table Bloat

```sql
-- Tables with excessive bloat
WITH bloat_check AS (
  SELECT
    schemaname,
    relname,
    n_live_tup,
    n_dead_tup,
    round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio
  FROM pg_stat_user_tables
  WHERE n_live_tup > 1000
)
SELECT
  COUNT(*) AS bloated_table_count,
  MAX(dead_ratio) AS max_dead_ratio,
  CASE
    WHEN MAX(dead_ratio) > 40 THEN 'CRITICAL'
    WHEN MAX(dead_ratio) > 25 THEN 'WARNING'
    WHEN COUNT(*) > 0 THEN 'INFO'
    ELSE 'OK'
  END AS status
FROM bloat_check
WHERE dead_ratio > 20;
```

### Vacuum and Analyze Age

```sql
-- Tables not vacuumed recently
WITH vacuum_age AS (
  SELECT
    schemaname,
    relname,
    EXTRACT(epoch FROM (now() - GREATEST(last_vacuum, last_autovacuum))) / 3600 AS hours_since_vacuum,
    EXTRACT(epoch FROM (now() - GREATEST(last_analyze, last_autoanalyze))) / 3600 AS hours_since_analyze
  FROM pg_stat_user_tables
  WHERE n_live_tup > 1000
)
SELECT
  COUNT(*) FILTER (WHERE hours_since_vacuum > 168) AS stale_vacuum_count,
  COUNT(*) FILTER (WHERE hours_since_analyze > 168) AS stale_analyze_count,
  MAX(hours_since_vacuum) AS max_hours_since_vacuum,
  CASE
    WHEN MAX(hours_since_vacuum) > 336 THEN 'CRITICAL'  -- 14 days
    WHEN MAX(hours_since_vacuum) > 168 THEN 'WARNING'   -- 7 days
    ELSE 'OK'
  END AS status
FROM vacuum_age;
```

### Unused Indexes

```sql
-- Large unused indexes
WITH unused AS (
  SELECT
    schemaname,
    tablename,
    indexrelname,
    pg_relation_size(indexrelid) AS index_size
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0
    AND indexrelname NOT LIKE '%_pkey'
    AND pg_relation_size(indexrelid) > 10485760  -- > 10 MB
)
SELECT
  COUNT(*) AS unused_index_count,
  pg_size_pretty(SUM(index_size)::bigint) AS total_wasted_space,
  CASE
    WHEN SUM(index_size) > 1073741824 THEN 'WARNING'  -- > 1 GB
    WHEN COUNT(*) > 10 THEN 'INFO'
    ELSE 'OK'
  END AS status
FROM unused;
```

## Resource Health

### Disk Space

```sql
-- Database size check
WITH size_check AS (
  SELECT
    pg_database_size(current_database()) AS db_size,
    pg_tablespace_size('pg_default') AS tablespace_size
)
SELECT
  pg_size_pretty(db_size) AS database_size,
  db_size,
  CASE
    -- These thresholds should be customized based on available disk space
    WHEN db_size > 900000000000 THEN 'CRITICAL'  -- > 900 GB
    WHEN db_size > 800000000000 THEN 'WARNING'   -- > 800 GB
    ELSE 'OK'
  END AS status
FROM size_check;
```

### Temporary File Usage

```sql
-- Excessive temp file usage
SELECT
  datname,
  temp_files,
  pg_size_pretty(temp_bytes) AS temp_size,
  CASE
    WHEN temp_bytes > 10737418240 THEN 'CRITICAL'  -- > 10 GB
    WHEN temp_bytes > 5368709120 THEN 'WARNING'    -- > 5 GB
    ELSE 'OK'
  END AS status
FROM pg_stat_database
WHERE datname = current_database();
```

## Comprehensive Health Check Function

Create a function that runs all critical checks:

```sql
CREATE OR REPLACE FUNCTION check_database_health()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  message TEXT,
  details JSONB
) AS $$
BEGIN
  -- Connection utilization
  RETURN QUERY
  WITH conn_check AS (
    SELECT
      COUNT(*) AS current,
      current_setting('max_connections')::int -
      current_setting('superuser_reserved_connections')::int AS available
    FROM pg_stat_activity
  )
  SELECT
    'connection_utilization'::TEXT,
    CASE
      WHEN current >= available * 0.95 THEN 'CRITICAL'
      WHEN current >= available * 0.80 THEN 'WARNING'
      ELSE 'OK'
    END,
    format('%s of %s connections used', current, available),
    jsonb_build_object('current', current, 'available', available)
  FROM conn_check;

  -- Cache hit ratio
  RETURN QUERY
  WITH cache_check AS (
    SELECT
      sum(blks_hit) AS hits,
      sum(blks_read) AS reads
    FROM pg_stat_database
    WHERE datname = current_database()
  )
  SELECT
    'cache_hit_ratio'::TEXT,
    CASE
      WHEN hits + reads = 0 THEN 'OK'
      WHEN hits::float / NULLIF(hits + reads, 0) < 0.90 THEN 'CRITICAL'
      WHEN hits::float / NULLIF(hits + reads, 0) < 0.95 THEN 'WARNING'
      ELSE 'OK'
    END,
    format('Cache hit ratio: %s%%',
      round(100.0 * hits / NULLIF(hits + reads, 0), 2)),
    jsonb_build_object('hits', hits, 'reads', reads)
  FROM cache_check;

  -- Idle in transaction
  RETURN QUERY
  WITH idle_check AS (
    SELECT
      COUNT(*) AS count,
      MAX(EXTRACT(epoch FROM age(now(), state_change))) AS max_age
    FROM pg_stat_activity
    WHERE state = 'idle in transaction'
  )
  SELECT
    'idle_in_transaction'::TEXT,
    CASE
      WHEN max_age > 600 THEN 'CRITICAL'
      WHEN max_age > 300 THEN 'WARNING'
      WHEN count > 0 THEN 'INFO'
      ELSE 'OK'
    END,
    format('%s idle in transaction (max age: %s seconds)', count, round(max_age)),
    jsonb_build_object('count', count, 'max_age_seconds', round(max_age))
  FROM idle_check;

  -- Bloat check
  RETURN QUERY
  WITH bloat_check AS (
    SELECT
      COUNT(*) AS count,
      MAX(round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2)) AS max_ratio
    FROM pg_stat_user_tables
    WHERE n_live_tup > 1000
      AND n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0) > 0.20
  )
  SELECT
    'table_bloat'::TEXT,
    CASE
      WHEN max_ratio > 40 THEN 'CRITICAL'
      WHEN max_ratio > 25 THEN 'WARNING'
      WHEN count > 0 THEN 'INFO'
      ELSE 'OK'
    END,
    format('%s tables with >20%% bloat (max: %s%%)', count, max_ratio),
    jsonb_build_object('bloated_tables', count, 'max_dead_ratio', max_ratio)
  FROM bloat_check;

  -- Replication lag (if applicable)
  RETURN QUERY
  SELECT
    'replication_lag'::TEXT,
    CASE
      WHEN pg_is_in_recovery() = false THEN 'N/A'
      WHEN EXTRACT(epoch FROM (now() - pg_last_xact_replay_timestamp())) > 60
        THEN 'CRITICAL'
      WHEN EXTRACT(epoch FROM (now() - pg_last_xact_replay_timestamp())) > 30
        THEN 'WARNING'
      ELSE 'OK'
    END,
    CASE
      WHEN pg_is_in_recovery() = false THEN 'Primary server'
      ELSE format('Lag: %s seconds',
        round(EXTRACT(epoch FROM (now() - pg_last_xact_replay_timestamp()))))
    END,
    CASE
      WHEN pg_is_in_recovery() = false THEN jsonb_build_object('is_primary', true)
      ELSE jsonb_build_object(
        'lag_seconds',
        round(EXTRACT(epoch FROM (now() - pg_last_xact_replay_timestamp())))
      )
    END;

END;
$$ LANGUAGE plpgsql;
```

Usage:

```sql
-- Run all health checks
SELECT * FROM check_database_health();

-- Filter to only problems
SELECT * FROM check_database_health()
WHERE status NOT IN ('OK', 'N/A');
```

## Alerting Integration

### Export for Monitoring Tools

```sql
-- JSON format for monitoring tools
SELECT jsonb_object_agg(check_name, jsonb_build_object(
  'status', status,
  'message', message,
  'details', details
)) AS health_checks
FROM check_database_health();
```

### Prometheus/Grafana Format

```sql
-- Metrics format
SELECT
  check_name AS metric,
  CASE status
    WHEN 'OK' THEN 0
    WHEN 'INFO' THEN 1
    WHEN 'WARNING' THEN 2
    WHEN 'CRITICAL' THEN 3
    ELSE -1
  END AS value,
  message AS description
FROM check_database_health();
```

## Automated Alerting

Create a monitoring table for tracking health over time:

```sql
CREATE TABLE health_check_history (
  check_time TIMESTAMP DEFAULT now(),
  check_name TEXT,
  status TEXT,
  message TEXT,
  details JSONB
);

-- Insert health checks periodically
INSERT INTO health_check_history (check_name, status, message, details)
SELECT * FROM check_database_health();

-- Query health trends
SELECT
  check_name,
  date_trunc('hour', check_time) AS hour,
  COUNT(*) FILTER (WHERE status = 'CRITICAL') AS critical_count,
  COUNT(*) FILTER (WHERE status = 'WARNING') AS warning_count,
  COUNT(*) FILTER (WHERE status = 'OK') AS ok_count
FROM health_check_history
WHERE check_time > now() - interval '24 hours'
GROUP BY check_name, date_trunc('hour', check_time)
ORDER BY hour DESC, check_name;
```

## Best Practices

1. **Start simple**: Monitor critical metrics first, expand over time
2. **Avoid alert fatigue**: Set appropriate thresholds
3. **Test your alerts**: Verify they fire when they should
4. **Document runbooks**: What to do when alerts fire
5. **Track alert response**: Monitor mean time to resolution
6. **Regular reviews**: Adjust thresholds based on experience
7. **Automate collection**: Use cron jobs or monitoring agents
8. **Store history**: Track metrics over time for trend analysis

## Alert Response Runbook

When alerts fire:

### CRITICAL: Connection Exhaustion
1. Check for connection leaks in application
2. Review pg_stat_activity for idle connections
3. Consider terminating idle connections
4. Scale up connection pooler if using one

### CRITICAL: Cache Hit Ratio Low
1. Check for new queries with sequential scans
2. Review recent schema changes
3. Consider increasing shared_buffers
4. Analyze frequently accessed tables

### CRITICAL: Replication Lag
1. Check network connectivity
2. Review primary server load
3. Check for long-running queries on primary
4. Consider scaling replica resources

### WARNING: Table Bloat
1. Check last vacuum/autovacuum time
2. Review autovacuum settings
3. Run manual VACUUM if needed
4. Consider VACUUM FULL during maintenance window

## Conclusion

Effective health monitoring is essential for production databases. Regular checks, appropriate alerting, and documented response procedures ensure database reliability and performance.

Key takeaways:
- Monitor proactively, not reactively
- Set meaningful thresholds
- Automate checks and alerting
- Document response procedures
- Review and adjust regularly
