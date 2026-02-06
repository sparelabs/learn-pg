---
title: Collecting and Updating Statistics
description: Learn how to collect statistics with ANALYZE and configure autovacuum
estimatedMinutes: 30
---

# Collecting and Updating Statistics

Statistics are only useful when they're accurate and up-to-date. This lesson covers how PostgreSQL collects statistics and how you can control this process.

## The ANALYZE Command

The ANALYZE command examines a table and updates statistics about the data distribution.

### Basic Syntax

```sql
-- Analyze entire database
ANALYZE;

-- Analyze specific table
ANALYZE table_name;

-- Analyze specific columns only
ANALYZE table_name (column1, column2);

-- Analyze with VERBOSE output
ANALYZE VERBOSE table_name;
```

### How ANALYZE Works

ANALYZE doesn't scan the entire table. Instead, it:
1. **Samples rows**: Takes a random sample of rows (not all rows)
2. **Calculates statistics**: Computes distributions, frequencies, etc.
3. **Updates catalogs**: Stores results in pg_statistic
4. **Is non-blocking**: Other queries can run simultaneously

### Sample Size

The number of rows sampled is controlled by:

```sql
-- View current setting (per column)
SHOW default_statistics_target;  -- Default: 100

-- Set for entire database
ALTER DATABASE mydb SET default_statistics_target = 200;

-- Set for specific table
ALTER TABLE users ALTER COLUMN email SET STATISTICS 500;

-- Set for specific column
ALTER TABLE orders ALTER COLUMN total_amount SET STATISTICS 1000;
```

**Statistics target** determines:
- Number of entries in MCV (Most Common Values) list
- Number of histogram bins
- Sample size (roughly 300 × target rows)

Higher values = more accurate statistics but slower ANALYZE and more storage.

## Autovacuum and Auto-ANALYZE

PostgreSQL's autovacuum daemon automatically analyzes tables when they change significantly.

### Configuration Parameters

```sql
-- Check if autovacuum is enabled (should be on)
SHOW autovacuum;

-- View auto-analyze settings
SHOW autovacuum_analyze_threshold;      -- Default: 50 rows
SHOW autovacuum_analyze_scale_factor;   -- Default: 0.1 (10%)
```

### When Auto-ANALYZE Triggers

A table is analyzed when:
```
changes >= autovacuum_analyze_threshold + (autovacuum_analyze_scale_factor × table_size)
```

Example: For a 10,000 row table with defaults:
```
50 + (0.1 × 10,000) = 1,050 changes needed
```

For a 10,000,000 row table:
```
50 + (0.1 × 10,000,000) = 1,000,050 changes needed
```

### Problem: Large Tables

Large tables need many changes before auto-analyze triggers. This can lead to stale statistics.

**Solution**: Adjust per-table settings:

```sql
-- Make auto-analyze more aggressive for large table
ALTER TABLE large_orders SET (
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 1000
);

-- Now triggers at: 1000 + (0.02 × rows) changes
```

## Monitoring Statistics Collection

### Check Last ANALYZE Time

```sql
SELECT schemaname, relname,
       last_analyze,
       last_autoanalyze,
       n_live_tup,
       n_mod_since_analyze,
       CASE
         WHEN last_analyze IS NULL AND last_autoanalyze IS NULL
         THEN 'Never analyzed'
         WHEN n_mod_since_analyze > n_live_tup * 0.1
         THEN 'Stale (>10% changed)'
         ELSE 'Current'
       END AS status
FROM pg_stat_user_tables
ORDER BY n_mod_since_analyze DESC;
```

### Identify Tables Needing ANALYZE

```sql
SELECT schemaname, relname,
       n_live_tup AS rows,
       n_mod_since_analyze AS changes,
       round(100.0 * n_mod_since_analyze / NULLIF(n_live_tup, 0), 1) AS pct_changed,
       last_analyze,
       last_autoanalyze
FROM pg_stat_user_tables
WHERE n_live_tup > 1000  -- Ignore small tables
  AND n_mod_since_analyze > 0.1 * n_live_tup  -- More than 10% changed
ORDER BY n_mod_since_analyze DESC
LIMIT 20;
```

## When to Run ANALYZE Manually

### After Bulk Operations

```sql
-- After large data load
COPY users FROM '/data/users.csv';
ANALYZE users;

-- After bulk updates
UPDATE products SET price = price * 1.1 WHERE category = 'electronics';
ANALYZE products;

-- After bulk deletes
DELETE FROM logs WHERE created_at < NOW() - INTERVAL '1 year';
ANALYZE logs;
```

### After Schema Changes

```sql
-- After adding an index
CREATE INDEX idx_users_email ON users(email);
ANALYZE users;  -- Update correlation statistics

-- After changing column types
ALTER TABLE orders ALTER COLUMN total TYPE DECIMAL(12,2);
ANALYZE orders;
```

### For Query Performance Debugging

```sql
-- If query plans seem suboptimal
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'pending';

-- Check if estimates match reality, if not:
ANALYZE orders;
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'pending';
```

## ANALYZE Performance Considerations

### ANALYZE Cost

```sql
-- ANALYZE is relatively fast but not free
-- Larger statistics target = slower ANALYZE

-- Example timings for 10M row table:
-- default_statistics_target = 100:  ~2 seconds
-- default_statistics_target = 1000: ~15 seconds
```

### Lock Behavior

ANALYZE acquires a **SHARE UPDATE EXCLUSIVE** lock:
- Allows concurrent reads (SELECT)
- Allows concurrent writes (INSERT, UPDATE, DELETE)
- Prevents concurrent DDL (ALTER TABLE, DROP INDEX)

```sql
-- This is safe to run on production
ANALYZE users;  -- Won't block normal queries
```

### Avoiding ANALYZE Overhead

```sql
-- Don't analyze columns you don't query
-- Instead of:
ANALYZE users;  -- Analyzes all columns

-- Do:
ANALYZE users (user_id, email, created_at);  -- Only columns in WHERE/JOIN
```

## Advanced Configuration

### Table-Specific Statistics Targets

```sql
-- Critical columns for query performance
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 500;
ALTER TABLE orders ALTER COLUMN order_date SET STATISTICS 300;

-- Rarely queried columns
ALTER TABLE orders ALTER COLUMN notes SET STATISTICS 10;

-- Check current settings
SELECT tablename, attname, attstattarget
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relname = 'orders'
  AND attstattarget <> -1;  -- -1 means using default
```

### Autovacuum Tuning

```sql
-- More aggressive auto-analyze for frequently updated table
ALTER TABLE session_logs SET (
  autovacuum_analyze_scale_factor = 0.01,  -- Trigger at 1% changes
  autovacuum_analyze_threshold = 500
);

-- Less aggressive for rarely updated table
ALTER TABLE country_codes SET (
  autovacuum_analyze_scale_factor = 0.5,   -- Trigger at 50% changes
  autovacuum_analyze_threshold = 5000
);
```

## Best Practices

1. **Trust autovacuum for most tables**: It works well for typical workloads
2. **Manual ANALYZE after bulk operations**: Don't wait for autovacuum
3. **Tune large tables individually**: Use smaller scale_factor for big tables
4. **Increase statistics target for join columns**: Especially foreign keys
5. **Monitor statistics age**: Set up alerts for stale statistics
6. **Use ANALYZE VERBOSE**: When debugging to see what's happening
7. **Don't over-analyze**: More isn't always better

## Common Pitfalls

### Disabling Autovacuum

```sql
-- DON'T DO THIS (without very good reason)
ALTER TABLE users SET (autovacuum_enabled = false);

-- Statistics become stale
-- Query performance degrades over time
```

### Forgetting Manual ANALYZE

```sql
-- After bulk load
INSERT INTO users SELECT * FROM staging.users;  -- 1 million rows
-- Forgot ANALYZE - queries will be slow!

-- Always follow with:
ANALYZE users;
```

### One-Size-Fits-All Statistics Target

```sql
-- Not all columns need the same statistics detail
-- High-cardinality, frequently queried columns: higher target
-- Low-cardinality or rarely queried: lower target
```

## Monitoring Query

Put this in your monitoring system:

```sql
-- Alert on stale statistics
SELECT
  schemaname,
  relname,
  n_live_tup,
  n_mod_since_analyze,
  last_analyze,
  last_autoanalyze,
  age(now(), COALESCE(last_analyze, last_autoanalyze)) as time_since_analyze
FROM pg_stat_user_tables
WHERE n_live_tup > 10000  -- Significant tables
  AND (
    last_analyze IS NULL
    OR age(now(), COALESCE(last_analyze, last_autoanalyze)) > INTERVAL '7 days'
    OR n_mod_since_analyze > 0.2 * n_live_tup  -- 20% changed
  )
ORDER BY n_mod_since_analyze DESC;
```

## Next Steps

Now that you understand how to collect statistics, the next lesson will explore what those statistics contain and how to interpret them using pg_stats.
