---
title: Statistics Configuration and Tuning
description: Learn how to configure and tune statistics collection for optimal query performance
estimatedMinutes: 30
---

# Statistics Configuration and Tuning

Proper statistics configuration is crucial for optimal query performance. This lesson covers all the parameters that control statistics collection and how to tune them for your workload.

## Key Configuration Parameters

### default_statistics_target

Controls the amount of statistical detail collected.

```sql
-- View current setting
SHOW default_statistics_target;
-- Default: 100

-- Set database-wide
ALTER DATABASE mydb SET default_statistics_target = 200;

-- Set for current session
SET default_statistics_target = 150;

-- Set in postgresql.conf (requires restart)
default_statistics_target = 200
```

**What it affects:**
- Number of MCV (Most Common Values) entries
- Number of histogram bins
- Sample size for ANALYZE (roughly 300 × target)

**Higher values:**
- More accurate statistics
- Slower ANALYZE operations
- More storage for statistics
- Better query plans

**Recommended values:**
- Default (100): Most workloads
- 200-500: Data warehouses, complex queries
- 1000+: Critical columns with high cardinality

### Per-Column Statistics Target

Override default for specific columns.

```sql
-- High cardinality column used in JOINs
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 500;

-- Low cardinality column
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 50;

-- Rarely queried column
ALTER TABLE orders ALTER COLUMN notes SET STATISTICS 10;

-- Reset to default
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS -1;

ANALYZE orders;
```

**Guidelines:**

```sql
-- Increase statistics target for:
-- 1. High-cardinality columns (many distinct values)
ALTER TABLE events ALTER COLUMN user_id SET STATISTICS 500;

-- 2. Frequently joined columns (foreign keys)
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 300;

-- 3. Columns with skewed distributions
ALTER TABLE products ALTER COLUMN category_id SET STATISTICS 400;

-- 4. Columns in complex WHERE clauses
ALTER TABLE transactions ALTER COLUMN amount SET STATISTICS 300;

-- Decrease statistics target for:
-- 1. Low-cardinality columns
ALTER TABLE users ALTER COLUMN gender SET STATISTICS 50;

-- 2. Rarely queried columns
ALTER TABLE audit_log ALTER COLUMN notes SET STATISTICS 10;
```

### Check Current Statistics Targets

```sql
SELECT n.nspname AS schema,
       c.relname AS table,
       a.attname AS column,
       CASE a.attstattarget
         WHEN -1 THEN (SELECT setting::int FROM pg_settings WHERE name = 'default_statistics_target')
         ELSE a.attstattarget
       END AS statistics_target
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;
```

## Autovacuum Configuration

### Global Autovacuum Settings

```sql
-- Enable autovacuum (should always be on!)
SHOW autovacuum;  -- Default: on

-- Auto-analyze threshold (minimum changes to trigger)
SHOW autovacuum_analyze_threshold;  -- Default: 50

-- Auto-analyze scale factor (percentage of table size)
SHOW autovacuum_analyze_scale_factor;  -- Default: 0.1 (10%)

-- Maximum autovacuum workers
SHOW autovacuum_max_workers;  -- Default: 3
```

### Calculate When Auto-Analyze Triggers

```sql
-- Formula: threshold + (scale_factor × table_size)

-- For a 1,000 row table (default settings):
-- 50 + (0.1 × 1,000) = 150 changes

-- For a 1,000,000 row table:
-- 50 + (0.1 × 1,000,000) = 100,050 changes

-- For a 100,000,000 row table:
-- 50 + (0.1 × 100,000,000) = 10,000,050 changes (!)
```

### Per-Table Autovacuum Settings

```sql
-- More aggressive auto-analyze for frequently updated table
ALTER TABLE session_logs SET (
  autovacuum_analyze_threshold = 100,
  autovacuum_analyze_scale_factor = 0.02  -- 2% instead of 10%
);

-- Less aggressive for rarely updated table
ALTER TABLE country_codes SET (
  autovacuum_analyze_scale_factor = 0.5  -- 50%
);

-- Disable autovacuum for specific table (rarely a good idea!)
ALTER TABLE staging_temp SET (
  autovacuum_enabled = false
);
```

### Large Table Problem and Solutions

```sql
-- Problem: Large tables rarely get auto-analyzed
-- Solution 1: Reduce scale_factor
ALTER TABLE huge_events SET (
  autovacuum_analyze_scale_factor = 0.01  -- 1% of table
);

-- Solution 2: Increase threshold with small scale_factor
ALTER TABLE huge_events SET (
  autovacuum_analyze_threshold = 10000,
  autovacuum_analyze_scale_factor = 0.005  -- 0.5%
);

-- Solution 3: Partition large tables
-- Each partition analyzed independently
CREATE TABLE events_2024_01 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- Smaller partitions = more frequent auto-analyze
```

## Monitoring Statistics Collection

### Check Statistics Age

```sql
SELECT schemaname,
       relname,
       n_live_tup AS rows,
       n_mod_since_analyze AS changes,
       CASE
         WHEN n_live_tup > 0
         THEN round(100.0 * n_mod_since_analyze / n_live_tup, 2)
         ELSE 0
       END AS pct_changed,
       last_analyze,
       last_autoanalyze,
       COALESCE(last_analyze, last_autoanalyze) AS last_stats_update,
       age(now(), COALESCE(last_analyze, last_autoanalyze)) AS stats_age
FROM pg_stat_user_tables
WHERE n_live_tup > 100  -- Ignore tiny tables
ORDER BY n_mod_since_analyze DESC
LIMIT 20;
```

### Identify Stale Statistics

```sql
SELECT schemaname, relname,
       n_live_tup,
       n_mod_since_analyze,
       round(100.0 * n_mod_since_analyze / NULLIF(n_live_tup, 0), 1) AS pct_changed,
       COALESCE(last_analyze, last_autoanalyze) AS last_updated,
       age(now(), COALESCE(last_analyze, last_autoanalyze)) AS age
FROM pg_stat_user_tables
WHERE n_live_tup > 1000
  AND (
    -- Never analyzed
    last_analyze IS NULL AND last_autoanalyze IS NULL
    OR
    -- >20% of rows changed
    n_mod_since_analyze > n_live_tup * 0.2
    OR
    -- Statistics older than 7 days
    age(now(), COALESCE(last_analyze, last_autoanalyze)) > INTERVAL '7 days'
  )
ORDER BY n_mod_since_analyze DESC;
```

### Monitor ANALYZE Operations

```sql
-- See recent ANALYZE operations (requires pg_stat_statements)
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
WHERE query LIKE '%ANALYZE%'
ORDER BY total_exec_time DESC
LIMIT 10;

-- Or check PostgreSQL logs
-- Set in postgresql.conf:
-- log_autovacuum_min_duration = 0  -- Log all autovacuum activities
```

## Performance Tuning Strategies

### Strategy 1: Prioritize Critical Tables

```sql
-- Identify critical tables (frequently queried, large)
SELECT schemaname, relname,
       seq_scan + idx_scan AS total_scans,
       n_live_tup
FROM pg_stat_user_tables
WHERE n_live_tup > 10000
ORDER BY seq_scan + idx_scan DESC
LIMIT 20;

-- Increase statistics target for critical tables
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 500;
ALTER TABLE orders ALTER COLUMN product_id SET STATISTICS 500;
ALTER TABLE orders ALTER COLUMN order_date SET STATISTICS 300;

-- More aggressive auto-analyze
ALTER TABLE orders SET (
  autovacuum_analyze_scale_factor = 0.02
);

ANALYZE orders;
```

### Strategy 2: Column-Specific Tuning

```sql
-- Identify problematic columns (poor estimates)
-- Run EXPLAIN ANALYZE and compare estimates vs actual

-- Example: customer_id estimates are off
EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 12345;
-- Estimated rows: 100
-- Actual rows: 1,250

-- Solution: Increase statistics for customer_id
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 1000;
ANALYZE orders;

-- Test again
EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 12345;
-- Estimates should be closer to actual
```

### Strategy 3: Partition Large Tables

```sql
-- Before: Single 1B row table
-- Auto-analyze needs 100M changes to trigger!

-- After: Partition by month (12 partitions × ~83M rows)
CREATE TABLE orders_partitioned (
  order_id BIGINT,
  order_date DATE,
  -- ...
) PARTITION BY RANGE (order_date);

CREATE TABLE orders_2024_01 PARTITION OF orders_partitioned
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
-- ... more partitions

-- Now each partition needs ~8.3M changes to trigger
-- Much more responsive to data changes
```

### Strategy 4: Scheduled ANALYZE

```sql
-- For critical tables with predictable bulk changes
-- Schedule ANALYZE after ETL jobs

-- In ETL script:
BEGIN;
-- Load data
COPY orders FROM '/data/daily_orders.csv';
-- Update statistics immediately
ANALYZE orders;
COMMIT;

-- Or use cron/pg_cron for nightly analysis:
-- SELECT cron.schedule('nightly-analyze', '0 2 * * *', 'ANALYZE orders;');
```

## Advanced Tuning

### Cost-Based Statistics Target

```sql
-- Measure ANALYZE cost vs benefit
-- Test different statistics targets

-- Baseline
ALTER TABLE products ALTER COLUMN category SET STATISTICS 100;
\timing on
ANALYZE products;
-- Time: 2.5s

-- Higher target
ALTER TABLE products ALTER COLUMN category SET STATISTICS 500;
ANALYZE products;
-- Time: 8.2s

-- Test query estimates
EXPLAIN SELECT * FROM products WHERE category = 'electronics';

-- If estimates significantly better with 500, worth the extra 5.7s
-- If estimates similar, stick with 100
```

### Statistics for Specific Workloads

```sql
-- OLTP (Online Transaction Processing)
-- - Frequent small updates
-- - Need current statistics
-- - Lower statistics targets OK (queries are simple)

ALTER TABLE users SET (
  autovacuum_analyze_scale_factor = 0.05,  -- Trigger at 5% changes
  autovacuum_analyze_threshold = 1000
);
ALTER TABLE users ALTER COLUMN user_id SET STATISTICS 100;

-- OLAP (Online Analytical Processing)
-- - Bulk loads
-- - Complex queries
-- - Need detailed statistics

ALTER TABLE fact_sales SET (
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 5000
);
ALTER TABLE fact_sales ALTER COLUMN customer_id SET STATISTICS 1000;
ALTER TABLE fact_sales ALTER COLUMN product_id SET STATISTICS 1000;
ALTER TABLE fact_sales ALTER COLUMN sale_date SET STATISTICS 500;
```

### Extended Statistics Tuning

```sql
-- After creating extended statistics, check effectiveness

-- Before extended statistics
EXPLAIN ANALYZE
SELECT * FROM addresses
WHERE country = 'USA' AND state = 'CA' AND city = 'San Francisco';
-- Estimated: 50 rows, Actual: 1,200 rows (24× off!)

-- Create extended statistics
CREATE STATISTICS stats_location (dependencies, ndistinct, mcv)
ON country, state, city
FROM addresses;

ANALYZE addresses;

-- After extended statistics
EXPLAIN ANALYZE
SELECT * FROM addresses
WHERE country = 'USA' AND state = 'CA' AND city = 'San Francisco';
-- Estimated: 1,180 rows, Actual: 1,200 rows (within 2%!)
```

## Common Tuning Scenarios

### Scenario 1: Data Warehouse with Daily ETL

```sql
-- Loads happen nightly, queries run during day

-- Approach: Manual ANALYZE after ETL
-- In ETL script (after loading):
ANALYZE fact_sales;
ANALYZE dim_customers;
ANALYZE dim_products;

-- Disable autovacuum_analyze (manual is more predictable)
ALTER TABLE fact_sales SET (autovacuum_enabled = true);  -- Keep vacuum
-- But rely on manual ANALYZE after ETL
```

### Scenario 2: High-Velocity OLTP System

```sql
-- Continuous writes, need current statistics

-- Approach: Aggressive auto-analyze
ALTER TABLE transactions SET (
  autovacuum_analyze_scale_factor = 0.01,  -- 1%
  autovacuum_analyze_threshold = 500
);

-- Moderate statistics targets (queries are simple)
ALTER TABLE transactions ALTER COLUMN user_id SET STATISTICS 150;
ALTER TABLE transactions ALTER COLUMN created_at SET STATISTICS 150;
```

### Scenario 3: Slow-Changing Dimension Tables

```sql
-- Reference data that rarely changes

-- Approach: Relaxed auto-analyze
ALTER TABLE countries SET (
  autovacuum_analyze_scale_factor = 0.5,  -- 50%
  autovacuum_analyze_threshold = 5000
);

-- Low statistics targets (low cardinality)
ALTER TABLE countries ALTER COLUMN country_code SET STATISTICS 50;
```

## Monitoring and Maintenance

### Weekly Statistics Health Check

```sql
-- Run this query weekly
WITH stats_health AS (
  SELECT schemaname, relname, n_live_tup,
         n_mod_since_analyze,
         round(100.0 * n_mod_since_analyze / NULLIF(n_live_tup, 0), 1) AS pct_changed,
         COALESCE(last_analyze, last_autoanalyze) AS last_updated,
         age(now(), COALESCE(last_analyze, last_autoanalyze)) AS age
  FROM pg_stat_user_tables
  WHERE n_live_tup > 1000
)
SELECT *,
       CASE
         WHEN last_updated IS NULL THEN 'CRITICAL: Never analyzed'
         WHEN age > INTERVAL '30 days' THEN 'WARNING: Very stale'
         WHEN pct_changed > 50 THEN 'WARNING: Many changes'
         WHEN age > INTERVAL '7 days' THEN 'INFO: Consider analyzing'
         ELSE 'OK'
       END AS status
FROM stats_health
WHERE last_updated IS NULL
   OR age > INTERVAL '7 days'
   OR pct_changed > 20
ORDER BY
  CASE
    WHEN last_updated IS NULL THEN 1
    WHEN age > INTERVAL '30 days' THEN 2
    WHEN pct_changed > 50 THEN 3
    ELSE 4
  END,
  n_mod_since_analyze DESC;
```

### Automated Maintenance Script

```sql
-- Create function to analyze stale tables
CREATE OR REPLACE FUNCTION maintain_statistics()
RETURNS TABLE(table_name text, action text, duration interval) AS $$
DECLARE
  rec RECORD;
  start_time timestamp;
BEGIN
  FOR rec IN
    SELECT schemaname, relname
    FROM pg_stat_user_tables
    WHERE n_live_tup > 1000
      AND (
        last_analyze IS NULL
        OR last_autoanalyze IS NULL
        OR n_mod_since_analyze > n_live_tup * 0.1
      )
    ORDER BY n_mod_since_analyze DESC
    LIMIT 10
  LOOP
    start_time := clock_timestamp();
    EXECUTE format('ANALYZE %I.%I', rec.schemaname, rec.relname);

    table_name := rec.schemaname || '.' || rec.relname;
    action := 'ANALYZED';
    duration := clock_timestamp() - start_time;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run weekly via pg_cron or external scheduler
SELECT * FROM maintain_statistics();
```

## Best Practices Summary

1. **Keep autovacuum enabled**: Never disable globally
2. **Use per-table settings**: Tune each table based on its workload
3. **Increase statistics target for**:
   - Foreign key columns
   - High-cardinality columns
   - Columns in complex WHERE clauses
4. **Use extended statistics** for correlated columns
5. **Manual ANALYZE after bulk operations**
6. **Monitor statistics age** regularly
7. **Test statistics changes**: Use EXPLAIN ANALYZE to verify improvements
8. **Document your tuning**: Record why settings were changed
9. **Partition very large tables**: For better statistics freshness
10. **Review quarterly**: Workloads change, statistics settings should too

## Next Steps

You now have comprehensive knowledge of PostgreSQL statistics! Practice by:
1. Analyzing your own databases for stale statistics
2. Identifying columns with poor estimates
3. Tuning statistics targets based on query patterns
4. Creating extended statistics for correlated data
5. Setting up monitoring for statistics health

Use these techniques to optimize query planning and achieve consistent, fast query performance.
