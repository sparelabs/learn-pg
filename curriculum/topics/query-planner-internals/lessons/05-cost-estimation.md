---
title: Cost Estimation and Statistics
description: Understand how PostgreSQL estimates costs and uses statistics to choose optimal plans
estimatedMinutes: 55
---

# Cost Estimation and Statistics

The query planner's effectiveness depends entirely on its ability to estimate costs accurately. Understanding how PostgreSQL calculates costs and uses statistics is essential for query optimization and troubleshooting.

## The Cost Model

### What is "Cost"?

Cost is an arbitrary unit representing the estimated work to execute a plan node. It's roughly calibrated to disk page fetches, but includes CPU and memory operations.

```
Cost = (disk I/O cost) + (CPU cost) + (memory cost)
```

Key points:
- **Relative, not absolute**: Compare costs between plans
- **Estimates, not measurements**: Based on statistics and assumptions
- **Lower is better**: Planner chooses lowest-cost plan

### Cost Components

#### Sequential Page Cost
```sql
SHOW seq_page_cost;  -- Default: 1.0
```

Cost to read one page sequentially from disk. This is the baseline unit.

#### Random Page Cost
```sql
SHOW random_page_cost;  -- Default: 4.0
```

Cost to read one page randomly (non-sequential). Default assumes HDD where random access is 4× slower than sequential.

For SSDs, reduce this ratio:
```sql
SET random_page_cost = 1.1;  -- SSD: random ≈ sequential
```

#### CPU Tuple Cost
```sql
SHOW cpu_tuple_cost;  -- Default: 0.01
```

Cost to process one row.

#### CPU Operator Cost
```sql
SHOW cpu_operator_cost;  -- Default: 0.0025
```

Cost to apply one operator (comparison, arithmetic, etc.).

#### CPU Index Tuple Cost
```sql
SHOW cpu_index_tuple_cost;  -- Default: 0.005
```

Cost to process one index entry.

## Calculating Sequential Scan Cost

Let's break down a sequential scan:

```sql
EXPLAIN SELECT * FROM users WHERE age > 25;
```

```
Seq Scan on users  (cost=0.00..18.50 rows=500 width=64)
  Filter: (age > 25)
```

### Formula
```
Startup cost = 0 (no setup needed)

Run cost = (pages * seq_page_cost) +
           (rows * cpu_tuple_cost) +
           (rows * cpu_operator_cost)  -- for filter evaluation

Total cost = startup + run
```

### Example Calculation
Table `users`:
- 1000 rows
- 100 rows per page = 10 pages
- Filter: `age > 25` (one operator)

```
Run cost = (10 * 1.0) +           -- Read 10 pages
           (1000 * 0.01) +        -- Process 1000 rows
           (1000 * 0.0025)        -- Apply filter 1000 times
         = 10 + 10 + 2.5
         = 22.5

Startup cost = 0
Total cost = 0.00..22.50
```

Add filter selectivity (500 rows match):
```
rows = 1000 * 0.5 = 500
width = average row width = 64 bytes
```

Result: `(cost=0.00..22.50 rows=500 width=64)`

## Calculating Index Scan Cost

Index scan is more complex:

```sql
CREATE INDEX idx_users_id ON users(id);

EXPLAIN SELECT * FROM users WHERE id = 42;
```

```
Index Scan using idx_users_id on users  (cost=0.28..8.29 rows=1 width=64)
  Index Cond: (id = 42)
```

### Formula
```
Startup cost = (index tree height * random_page_cost * 0.5)

Run cost = (index pages read * random_page_cost) +
           (index tuples * cpu_index_tuple_cost) +
           (heap pages read * random_page_cost) +
           (heap tuples * cpu_tuple_cost)

Total cost = startup + run
```

### Example Calculation
Index on `id`:
- B-tree height: 3 levels
- Index lookup: 3 pages
- Find 1 matching index entry
- Fetch 1 heap page
- Retrieve 1 row

```
Startup cost = 3 * 4.0 * 0.5 = 6.0  -- Descend index tree

Run cost = (1 * 4.0) +               -- Read 1 index page
           (1 * 0.005) +             -- Process 1 index tuple
           (1 * 4.0) +               -- Read 1 heap page
           (1 * 0.01)                -- Process 1 row
         = 4.0 + 0.005 + 4.0 + 0.01
         = 8.015

Total cost = 6.0 + 8.015 = 14.015
```

With optimizations, PostgreSQL might estimate: `cost=0.28..8.29`

The startup cost is lower because the planner uses statistics about index correlation and caching.

## Statistics: The Foundation of Estimation

### What Statistics Are Collected

For each table column, PostgreSQL tracks:

1. **Number of rows** (`reltuples`)
2. **Number of pages** (`relpages`)
3. **Most common values** (MCVs) and their frequencies
4. **Histogram bounds** (distribution of values)
5. **NULL fraction**
6. **Average width**
7. **Correlation** (physical vs. logical order)

### Viewing Statistics

```sql
-- High-level table statistics
SELECT relname, reltuples, relpages
FROM pg_class
WHERE relname = 'users';

-- Detailed column statistics
SELECT
    attname,
    n_distinct,
    most_common_vals,
    most_common_freqs,
    histogram_bounds,
    correlation
FROM pg_stats
WHERE tablename = 'users' AND attname = 'age';
```

### Statistics Target

Controls how many statistics are collected:

```sql
-- Show default
SHOW default_statistics_target;  -- Default: 100

-- Increase for specific column (more accurate, slower ANALYZE)
ALTER TABLE users ALTER COLUMN age SET STATISTICS 1000;

-- Update statistics
ANALYZE users;
```

Higher target:
- More histogram buckets
- Better selectivity estimates
- Slower ANALYZE
- More storage in pg_statistic

## Selectivity Estimation

Selectivity = fraction of rows matching a condition

### Equality (=)

```sql
WHERE age = 25
```

**If 25 is a Most Common Value (MCV)**:
```
Selectivity = frequency of 25 from pg_stats
```

If `age = 25` appears in 5% of rows:
```
Selectivity = 0.05
```

**If 25 is not an MCV**:
Use histogram or assume uniform distribution:
```
Selectivity = 1.0 / n_distinct
```

If age has 50 distinct values:
```
Selectivity = 1/50 = 0.02
```

### Range (<, >, BETWEEN)

```sql
WHERE age > 25
```

Planner uses histogram bounds to estimate:
```
Selectivity = (max_value - 25) / (max_value - min_value)
```

If age ranges 18-80:
```
Selectivity = (80 - 25) / (80 - 18) = 55 / 62 ≈ 0.89
```

### Multiple Conditions (AND)

```sql
WHERE age > 25 AND city = 'Boston'
```

Planner assumes independence:
```
Combined selectivity = sel(age > 25) × sel(city = 'Boston')
```

If:
- `age > 25`: 60% of rows (0.6)
- `city = 'Boston'`: 5% of rows (0.05)

```
Combined = 0.6 × 0.05 = 0.03 (3% of rows)
```

**Problem**: Columns might be correlated (e.g., Boston residents are older).

### Multiple Conditions (OR)

```sql
WHERE age < 20 OR age > 80
```

```
Combined selectivity = sel(age < 20) + sel(age > 80) - (sel(age < 20) × sel(age > 80))
```

Using addition-subtraction formula to avoid double-counting.

### LIKE Patterns

```sql
WHERE name LIKE 'John%'
```

Planner estimates based on:
- If indexed, uses index statistics
- Otherwise, assumes small selectivity (often 0.01-0.1)

```sql
WHERE name LIKE '%john%'
```

Can't use index, often assumes ~0.01 selectivity.

## Correlation and Physical Ordering

Correlation measures how closely physical row order matches logical (value) order.

```sql
SELECT correlation
FROM pg_stats
WHERE tablename = 'users' AND attname = 'created_at';
```

- **+1.0**: Perfect correlation (rows inserted in order)
- **0.0**: Random order
- **-1.0**: Reverse order

### Why It Matters

High correlation means:
- Index scans access fewer heap pages (sequential reads)
- Lower cost for index scans

```sql
-- High correlation (0.98): efficient
EXPLAIN SELECT * FROM logs WHERE created_at > '2024-01-01';
-- Index Scan (reads rows in physical order)

-- Low correlation (0.05): inefficient
EXPLAIN SELECT * FROM logs WHERE random_id > 1000;
-- Might prefer Seq Scan (index would cause many random heap accesses)
```

### Improving Correlation

```sql
-- Reorder table to match index order
CLUSTER users USING users_pkey;

-- Check new correlation
SELECT correlation
FROM pg_stats
WHERE tablename = 'users' AND attname = 'id';
```

After CLUSTER, correlation should be near 1.0.

## When Estimates Go Wrong

### Problem 1: Stale Statistics

```sql
-- Last analyzed weeks ago, table has grown 10x
SELECT * FROM orders WHERE status = 'pending';
```

```
Index Scan (cost=... rows=10 ...) (actual rows=100000 loops=1)
```

Estimated 10 rows, actually 100,000!

**Solution**:
```sql
ANALYZE orders;
```

Or enable autovacuum (usually automatic):
```sql
SHOW autovacuum;  -- Should be 'on'
```

### Problem 2: Correlated Columns

```sql
-- Age and job_level are correlated (senior employees are older)
WHERE age > 50 AND job_level = 'Senior'
```

Planner assumes independence:
```
Selectivity = sel(age > 50) × sel(job_level = 'Senior')
            = 0.2 × 0.3 = 0.06
```

Reality: Almost all seniors are > 50, so true selectivity is ~0.3.

**Solutions**:
- Extended statistics (PostgreSQL 10+)
```sql
CREATE STATISTICS corr_age_level ON age, job_level FROM employees;
ANALYZE employees;
```

### Problem 3: Function Calls

```sql
WHERE LOWER(name) = 'john'
```

Planner can't use column statistics (function transforms values).

**Solution**: Function-based index
```sql
CREATE INDEX idx_lower_name ON users(LOWER(name));
```

Now planner can estimate using index statistics.

### Problem 4: Subquery Estimates

```sql
WHERE id IN (SELECT user_id FROM orders WHERE total > 1000)
```

Planner must estimate rows returned by subquery. Often uses default assumptions.

**Solution**: Materialize CTE or temporary table
```sql
WITH high_spenders AS (
    SELECT user_id FROM orders WHERE total > 1000
)
SELECT * FROM users WHERE id IN (SELECT user_id FROM high_spenders);
```

ANALYZE on temporary tables to get accurate counts.

## Memory Cost Estimation

### Sorts

```sql
Sort  (cost=1245.50..1270.75 rows=10000 width=64)
  Sort Key: created_at
```

Cost depends on:
- Number of rows
- Row width
- Available work_mem

If rows fit in `work_mem`:
```
Cost = (rows * log2(rows)) * cpu_operator_cost
```

Quicksort/mergesort: O(n log n) comparisons.

If rows don't fit (external merge sort):
```
Cost = (rows * disk_sort_factor) + disk_page_costs
```

Much higher cost!

### Hash Tables

```sql
Hash  (cost=25.00..25.00 rows=500 width=64)
  -> Seq Scan on products
```

Cost depends on:
- Number of rows
- Row width
- Available work_mem

If hash table fits in `work_mem`:
```
Cost = (rows * cpu_operator_cost) for hashing
```

If doesn't fit (multiple batches):
```
Cost = (batches * rows * cpu_operator_cost) + disk_I/O
```

Multiple batches significantly increase cost.

## Join Cost Estimation

### Nested Loop

```
Cost = outer_cost + (outer_rows * inner_cost)
```

If outer has 10 rows and each inner scan costs 8.29:
```
Cost = 12.45 + (10 * 8.29) = 95.35
```

### Hash Join

```
Cost = outer_cost + inner_cost + (outer_rows * cpu_operator_cost) + (inner_rows * cpu_operator_cost)
```

Build hash from inner (500 rows):
```
Hash cost = 25.00 + (500 * 0.0025) = 26.25
```

Probe with outer (1000 rows):
```
Probe cost = 95.00 + (1000 * 0.0025) = 97.50
```

Total: 123.75

### Merge Join

```
Cost = outer_sort_cost + inner_sort_cost + merge_cost
```

If both already sorted (via index), sort costs = 0.

Merge cost:
```
Merge cost = (outer_rows + inner_rows) * cpu_operator_cost
```

## Practical Tips for Better Estimates

### 1. Keep Statistics Fresh
```sql
-- Manual
ANALYZE;

-- Or ensure autovacuum is running
SELECT schemaname, relname, last_autoanalyze, n_mod_since_analyze
FROM pg_stat_user_tables
ORDER BY n_mod_since_analyze DESC;
```

### 2. Increase Statistics for Key Columns
```sql
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 500;
ALTER TABLE users ALTER COLUMN age SET STATISTICS 500;
ANALYZE orders;
ANALYZE users;
```

### 3. Use Extended Statistics
```sql
-- For correlated columns
CREATE STATISTICS stats_age_level (dependencies)
ON age, job_level FROM employees;

-- For multi-column conditions
CREATE STATISTICS stats_city_state (dependencies)
ON city, state FROM addresses;

ANALYZE employees;
ANALYZE addresses;
```

### 4. Adjust Cost Parameters
```sql
-- For SSD storage
SET random_page_cost = 1.1;
SET effective_cache_size = '16GB';  -- Help planner understand cache

-- For CPU-intensive workloads
SET cpu_operator_cost = 0.005;  -- Slower CPU
```

### 5. Monitor Estimate Accuracy
```sql
-- Compare estimated vs actual rows
EXPLAIN ANALYZE SELECT ...;
```

Look for big discrepancies in EXPLAIN ANALYZE output.

## Key Takeaways

- Cost is measured in arbitrary units, roughly equivalent to page reads
- Planner uses statistics from pg_statistic (updated by ANALYZE)
- Selectivity estimates drive row count predictions
- Row count estimates drive cost calculations
- Stale statistics lead to bad plans
- Correlation affects index scan costs
- Memory settings (work_mem) significantly impact sort/hash costs
- Extended statistics help with correlated columns
- Compare estimated vs. actual rows in EXPLAIN ANALYZE to detect issues

Understanding cost estimation helps you:
- Write queries that give planner good information
- Diagnose why planner chose a specific plan
- Know when to ANALYZE or adjust configuration

You now have a complete understanding of PostgreSQL's query planner internals!
