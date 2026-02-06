---
title: Introduction to PostgreSQL Statistics
description: Understand the role of statistics in query planning and optimization
estimatedMinutes: 25
---

# Introduction to PostgreSQL Statistics

PostgreSQL uses statistics about your data to make intelligent decisions about how to execute queries. These statistics are crucial for the query planner to estimate costs and choose the most efficient execution plan.

## Why Statistics Matter

When PostgreSQL receives a query, it needs to decide:
- Which indexes to use (if any)
- What order to join tables
- Which join methods to employ (nested loop, hash join, merge join)
- Whether to use sequential or index scans

Without accurate statistics, the query planner might make poor choices that lead to slow queries.

## How Statistics Are Collected

PostgreSQL collects statistics through a process called **ANALYZE**. This can happen:

### Automatically
- **Autovacuum**: By default, PostgreSQL runs autovacuum daemon which periodically analyzes tables
- Triggered after a certain percentage of rows are modified
- Configured via `autovacuum_analyze_threshold` and `autovacuum_analyze_scale_factor`

### Manually
You can run ANALYZE manually:

```sql
-- Analyze a specific table
ANALYZE users;

-- Analyze a specific column
ANALYZE users (email);

-- Analyze all tables in database
ANALYZE;
```

## What Statistics Track

PostgreSQL collects various types of statistics:

### Table-Level Statistics
- Number of rows (approximate)
- Number of pages (disk blocks)
- Last analyze/vacuum times
- Dead tuple count

### Column-Level Statistics
- **NULL fraction**: Percentage of NULL values
- **Average width**: Average size of values in bytes
- **N_distinct**: Number of distinct values
- **Most Common Values (MCV)**: Frequently occurring values and their frequencies
- **Histogram bounds**: Distribution of values across ranges
- **Correlation**: Physical ordering correlation with table storage

### Example: Viewing Statistics

```sql
-- Check when a table was last analyzed
SELECT schemaname, relname, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'users';

-- View column statistics
SELECT attname, n_distinct, null_frac, avg_width
FROM pg_stats
WHERE tablename = 'users';
```

## Statistics Storage

Statistics are stored in:
- **pg_statistic**: System catalog table (low-level, binary format)
- **pg_stats**: User-friendly view of pg_statistic
- **pg_class**: Table-level statistics (row counts, page counts)
- **pg_stat_user_tables**: Runtime statistics (scans, analyze times)

## Statistics and Query Planning

The query planner uses statistics to estimate:

1. **Selectivity**: What fraction of rows will match a condition?
   ```sql
   -- Planner estimates how many rows WHERE age > 30 returns
   SELECT * FROM users WHERE age > 30;
   ```

2. **Cardinality**: How many rows will a join produce?
   ```sql
   -- Planner estimates result size
   SELECT * FROM orders o JOIN users u ON o.user_id = u.id;
   ```

3. **Cost**: What's the relative cost of different execution methods?

### Example: Impact on Query Plans

Without statistics:
```sql
-- If planner thinks table is small, it might choose seq scan
Seq Scan on users  (cost=0.00..35.50 rows=1000 width=100)
```

With accurate statistics:
```sql
-- Knowing table is large, planner chooses index scan
Index Scan using users_email_idx on users  (cost=0.42..8.44 rows=1 width=100)
```

## Common Issues

### Stale Statistics
When data changes significantly but statistics aren't updated:
- Planner makes decisions based on outdated information
- Can lead to poor query performance
- Solution: Run ANALYZE more frequently

### Insufficient Statistics
Default statistics might not capture complex distributions:
- Only top 100 most common values tracked by default
- Histograms have limited buckets
- Solution: Adjust `default_statistics_target`

### Statistics Skew
When data distribution is highly non-uniform:
- Standard statistics might not represent reality
- Some values much more common than others
- Solution: Extended statistics (covered in later lessons)

## Best Practices

1. **Let autovacuum run**: Don't disable it without good reason
2. **Analyze after bulk changes**: After large INSERT/UPDATE/DELETE operations
3. **Monitor statistics age**: Check `last_analyze` timestamps
4. **Understand your data**: Know which columns have skewed distributions
5. **Use EXPLAIN**: Check if planner estimates match actual row counts

## Quick Reference

```sql
-- Run ANALYZE on a table
ANALYZE table_name;

-- Check statistics age
SELECT schemaname, relname,
       last_analyze,
       last_autoanalyze,
       n_live_tup, n_dead_tup
FROM pg_stat_user_tables;

-- View column statistics
SELECT * FROM pg_stats
WHERE tablename = 'your_table';

-- Check if autovacuum is enabled
SHOW autovacuum;
```

## Next Steps

In the following lessons, you'll learn:
1. How to collect and update statistics
2. Deep dive into pg_stats and column statistics
3. Understanding and interpreting histogram data
4. Extended statistics for multivariate analysis
5. Tuning statistics collection parameters

Understanding statistics is essential for database performance tuning. Let's dive deeper in the exercises!
