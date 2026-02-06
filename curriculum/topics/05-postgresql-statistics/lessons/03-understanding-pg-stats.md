---
title: Understanding pg_stats and Column Statistics
description: Deep dive into pg_stats view and how to interpret column-level statistics
estimatedMinutes: 35
---

# Understanding pg_stats and Column Statistics

The `pg_stats` view provides a readable interface to PostgreSQL's column statistics. Understanding this view is crucial for query optimization and performance tuning.

## The pg_stats View

`pg_stats` is a system view that makes statistics human-readable (unlike the binary pg_statistic catalog).

### Basic Query

```sql
SELECT *
FROM pg_stats
WHERE tablename = 'users'
  AND attname = 'country_code';
```

### Key Columns in pg_stats

| Column | Description |
|--------|-------------|
| `schemaname` | Schema containing the table |
| `tablename` | Table name |
| `attname` | Column name |
| `null_frac` | Fraction of NULL values (0.0 to 1.0) |
| `avg_width` | Average width in bytes |
| `n_distinct` | Number of distinct values |
| `most_common_vals` | Array of most common values |
| `most_common_freqs` | Frequencies of most common values |
| `histogram_bounds` | Histogram bucket boundaries |
| `correlation` | Statistical correlation with physical row order |

## Understanding Each Statistic

### NULL Fraction

Fraction of rows where the column is NULL.

```sql
SELECT attname, null_frac,
       round(null_frac * 100, 2) || '%' AS pct_null
FROM pg_stats
WHERE tablename = 'users';

-- Example output:
-- attname      | null_frac | pct_null
-- email        | 0.0       | 0.00%
-- phone        | 0.23      | 23.00%
-- middle_name  | 0.67      | 67.00%
```

**Query Planning Impact:**
- High null_frac affects `IS NULL` / `IS NOT NULL` selectivity estimates
- Planner knows `WHERE phone IS NOT NULL` returns ~77% of rows

### Average Width

Average storage size of column values in bytes.

```sql
SELECT attname, avg_width,
       CASE
         WHEN avg_width < 10 THEN 'Small'
         WHEN avg_width < 100 THEN 'Medium'
         ELSE 'Large'
       END AS size_category
FROM pg_stats
WHERE tablename = 'users';

-- Example output:
-- attname    | avg_width | size_category
-- user_id    | 4         | Small
-- email      | 25        | Medium
-- bio        | 450       | Large
```

**Query Planning Impact:**
- Affects memory estimates for sorts, hash joins, and work_mem calculations
- Wide columns increase cost of sequential scans

### N_distinct

Estimated number of distinct values.

```sql
SELECT attname, n_distinct, null_frac
FROM pg_stats
WHERE tablename = 'orders';

-- Example output:
-- attname      | n_distinct | null_frac
-- order_id     | -1         | 0
-- customer_id  | 45000      | 0
-- status       | 5          | 0
-- country      | 180        | 0.001
```

**Special Values:**
- **Positive number**: Actual estimate of distinct values
- **-1**: Column is unique (or nearly unique, >99% distinct)
- **Negative fraction**: Indicates fraction of total rows
  - `-0.5` means distinct values = 50% of table rows

**Query Planning Impact:**
- Used for GROUP BY cardinality estimates
- Affects join cost estimates
- Determines hash table size for hash joins

```sql
-- Planner uses n_distinct to estimate result size:
SELECT status, COUNT(*)
FROM orders
GROUP BY status;
-- Planner estimates ~5 output rows (n_distinct = 5)
```

### Most Common Values (MCV)

Array of the most frequently occurring values and their frequencies.

```sql
SELECT attname,
       most_common_vals AS mcv,
       most_common_freqs AS mcf
FROM pg_stats
WHERE tablename = 'orders'
  AND attname = 'status';

-- Example output:
-- attname | mcv                                      | mcf
-- status  | {pending,shipped,delivered,cancelled}    | {0.45,0.30,0.20,0.04}
```

This means:
- 45% of orders are 'pending'
- 30% are 'shipped'
- 20% are 'delivered'
- 4% are 'cancelled'
- 1% are other values (completed, returned, etc.)

**Query Planning Impact:**

```sql
-- Planner knows this is highly selective (4%)
SELECT * FROM orders WHERE status = 'cancelled';
-- Estimated rows: 4% of table

-- Planner knows this is not selective (45%)
SELECT * FROM orders WHERE status = 'pending';
-- Estimated rows: 45% of table
```

**MCV List Size:**

Controlled by statistics target:
```sql
-- Default: 100 entries in MCV list
SHOW default_statistics_target;

-- Increase for columns with many common values
ALTER TABLE orders ALTER COLUMN product_id SET STATISTICS 500;
ANALYZE orders;
```

### Histogram Bounds

For values not in the MCV list, PostgreSQL creates a histogram.

```sql
SELECT attname, histogram_bounds
FROM pg_stats
WHERE tablename = 'orders'
  AND attname = 'order_date';

-- Example output:
-- attname    | histogram_bounds
-- order_date | {2020-01-01,2020-04-15,2020-08-22,2020-12-31,2021-05-10,...}
```

**How Histograms Work:**

The histogram divides non-MCV values into equal-frequency buckets:
- Default: 100 buckets (controlled by statistics target)
- Each bucket contains approximately the same number of rows
- Boundaries show the min/max values in each bucket

**Query Planning Impact:**

```sql
-- Planner interpolates within histogram buckets
SELECT * FROM orders
WHERE order_date BETWEEN '2020-06-01' AND '2020-09-01';

-- Planner:
-- 1. Finds bucket containing 2020-06-01
-- 2. Finds bucket containing 2020-09-01
-- 3. Estimates rows as: (bucket_fraction × rows_per_bucket × num_buckets)
```

**Histogram Example:**

```sql
-- View histogram for a numeric column
SELECT attname,
       array_length(histogram_bounds, 1) AS num_buckets,
       (histogram_bounds[1])::text AS min_value,
       (histogram_bounds[array_length(histogram_bounds, 1)])::text AS max_value
FROM pg_stats
WHERE tablename = 'products'
  AND attname = 'price';
```

### Correlation

Statistical correlation between physical row order and logical column order.

```sql
SELECT attname, correlation
FROM pg_stats
WHERE tablename = 'orders';

-- Example output:
-- attname      | correlation
-- order_id     | 1.0
-- order_date   | 0.95
-- customer_id  | 0.12
-- product_id   | -0.05
```

**Understanding Correlation Values:**
- **1.0**: Perfect positive correlation (ordered same as table)
- **0.0**: No correlation (random order)
- **-1.0**: Perfect negative correlation (ordered opposite to table)

**Query Planning Impact:**

High positive correlation = efficient index scans:
```sql
-- order_date has correlation = 0.95
-- Sequential index reads = sequential disk reads
-- Very efficient!
SELECT * FROM orders
WHERE order_date BETWEEN '2024-01-01' AND '2024-01-31'
ORDER BY order_date;
```

Low correlation = random I/O:
```sql
-- customer_id has correlation = 0.12
-- Index reads jump around the table randomly
-- May be slower than seq scan for large ranges
SELECT * FROM orders
WHERE customer_id = 12345;
```

**Why Correlation Matters:**

```sql
-- Table physically ordered by order_id (correlation = 1.0)
-- Rows 1000-2000 are physically together on disk
SELECT * FROM orders WHERE order_id BETWEEN 1000 AND 2000;
-- Index scan is very efficient

-- customer_id is random (correlation = 0.12)
-- Rows for customer_id 1000-2000 scattered across entire table
SELECT * FROM orders WHERE customer_id BETWEEN 1000 AND 2000;
-- Index scan requires random I/O, might be slower than seq scan
```

## Practical Examples

### Example 1: Investigating Query Estimates

```sql
-- Query with poor estimates
EXPLAIN SELECT * FROM users WHERE age = 25;
-- Shows: rows=5000 (estimate)
-- Actual: rows=120

-- Check statistics for age column
SELECT attname, n_distinct, most_common_vals, most_common_freqs
FROM pg_stats
WHERE tablename = 'users' AND attname = 'age';

-- If age=25 isn't in MCV list, planner uses histogram
-- May need to increase statistics target
ALTER TABLE users ALTER COLUMN age SET STATISTICS 300;
ANALYZE users;
```

### Example 2: Understanding Slow Range Scans

```sql
-- Index scan surprisingly slow
SELECT * FROM events WHERE event_date BETWEEN '2024-01-01' AND '2024-01-31';

-- Check correlation
SELECT attname, correlation
FROM pg_stats
WHERE tablename = 'events' AND attname = 'event_date';

-- If correlation is low (e.g., 0.1), index scan does random I/O
-- Consider clustering the table:
CLUSTER events USING events_event_date_idx;
ANALYZE events;

-- Now correlation should be ~1.0
```

### Example 3: Finding Skewed Distributions

```sql
-- Find columns with highly skewed data
SELECT tablename, attname,
       most_common_vals[1] AS top_value,
       most_common_freqs[1] AS top_freq,
       round(most_common_freqs[1] * 100, 1) || '%' AS pct
FROM pg_stats
WHERE schemaname = 'public'
  AND most_common_freqs IS NOT NULL
  AND most_common_freqs[1] > 0.5  -- Top value is >50% of data
ORDER BY most_common_freqs[1] DESC;

-- High skew might need extended statistics
```

## Querying pg_stats Effectively

### Get Complete Column Profile

```sql
SELECT
  tablename,
  attname,
  n_distinct,
  null_frac,
  avg_width,
  correlation,
  array_length(most_common_vals, 1) AS mcv_count,
  array_length(histogram_bounds, 1) AS histogram_buckets
FROM pg_stats
WHERE tablename = 'your_table'
ORDER BY attname;
```

### Compare Estimates vs Reality

```sql
-- Run query with EXPLAIN ANALYZE
EXPLAIN ANALYZE
SELECT * FROM orders WHERE status = 'pending';

-- Compare estimated rows vs actual rows
-- If significantly different, check statistics:
SELECT most_common_vals, most_common_freqs
FROM pg_stats
WHERE tablename = 'orders' AND attname = 'status';
```

### Find Tables with Old or Missing Statistics

```sql
SELECT s.schemaname, s.tablename,
       COUNT(p.attname) AS columns,
       COUNT(p.most_common_vals) AS columns_with_mcv,
       t.last_analyze,
       t.last_autoanalyze
FROM pg_stats p
JOIN pg_stat_user_tables t
  ON p.tablename = t.relname AND p.schemaname = t.schemaname
WHERE s.schemaname = 'public'
GROUP BY s.schemaname, s.tablename, t.last_analyze, t.last_autoanalyze
HAVING COUNT(p.most_common_vals) < COUNT(p.attname) * 0.5
ORDER BY t.last_analyze NULLS FIRST;
```

## Limitations of Basic Statistics

### Independence Assumption

PostgreSQL assumes columns are statistically independent:

```sql
-- Reality: country='USA' AND state='CA' is correlated
-- Planner assumes: P(country='USA') × P(state='CA')
-- This can lead to wrong estimates

-- Solution: Extended statistics (next lesson)
CREATE STATISTICS stats_location ON country, state FROM addresses;
```

### Uniform Distribution Assumption

Within histogram buckets, values assumed uniformly distributed:
```sql
-- If data is clustered within buckets, estimates can be off
-- Increasing statistics target helps (more, smaller buckets)
```

## Next Steps

In the next lesson, we'll explore extended statistics, which address the independence assumption and handle correlated columns, functional dependencies, and more complex data patterns.
