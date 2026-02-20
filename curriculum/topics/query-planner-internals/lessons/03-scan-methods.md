---
title: Plan Node Types - Scan Methods
description: Deep dive into sequential scans, index scans, bitmap scans, and when each is used
estimatedMinutes: 55
---

# Plan Node Types: Scan Methods

Scan nodes are responsible for reading data from tables. The planner chooses different scan methods based on the query pattern, available indexes, and estimated costs. Understanding these choices is key to query optimization.

## Sequential Scan

### What It Is
Reads every row in the table sequentially, page by page.

```sql
EXPLAIN SELECT * FROM users WHERE age > 25;
```

```
Seq Scan on users  (cost=0.00..18.50 rows=500 width=64)
  Filter: (age > 25)
```

### When It's Used
- No index available on filter columns
- Table is small (index overhead not worth it)
- Query retrieves large percentage of rows
- Filter condition has low selectivity

### Characteristics
- **Startup cost**: Very low (0.00)
- **I/O pattern**: Sequential (efficient disk reads)
- **CPU cost**: Must evaluate filter on every row

### Example
```sql
-- Small table, no index on age
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT,
    age INT
);

INSERT INTO users (name, age)
SELECT 'User ' || i, 20 + (i % 50)
FROM generate_series(1, 1000) i;

EXPLAIN SELECT * FROM users WHERE age > 25;
```

Result: Sequential Scan (reading all 1000 rows is fine)

### When Sequential Scan is Optimal
```sql
-- Query returns most rows
SELECT * FROM users WHERE age > 10;  -- 90% of rows

-- Query needs all rows anyway
SELECT COUNT(*) FROM users;

-- Small tables
SELECT * FROM settings WHERE key = 'theme';  -- 10-row table
```

## Index Scan

### What It Is
Uses a B-tree index to find rows, then fetches those rows from the table.

```sql
CREATE INDEX idx_users_age ON users(age);

EXPLAIN SELECT * FROM users WHERE age = 25;
```

```
Index Scan using idx_users_age on users  (cost=0.28..8.29 rows=20 width=64)
  Index Cond: (age = 25)
```

### How It Works
1. Traverse B-tree index to find matching keys
2. For each match, follow pointer to heap (table) page
3. Fetch row from heap

### When It's Used
- Index available on filter/sort columns
- Query is selective (returns small % of rows)
- Need to retrieve actual row data (not just indexed columns)

### Characteristics
- **Startup cost**: Low to medium (0.28 typically)
- **I/O pattern**: Random access (can be expensive on HDD)
- **Efficiency**: Great for selective queries

### Index Scan Types

#### Equality Index Scan
```sql
EXPLAIN SELECT * FROM users WHERE id = 42;
```

```
Index Scan using users_pkey on users  (cost=0.28..8.29 rows=1 width=64)
  Index Cond: (id = 42)
```

Very efficient: one B-tree lookup.

#### Range Index Scan
```sql
EXPLAIN SELECT * FROM users WHERE age BETWEEN 25 AND 30;
```

```
Index Scan using idx_users_age on users  (cost=0.28..28.45 rows=120 width=64)
  Index Cond: ((age >= 25) AND (age <= 30))
```

Scans index range, fetches matching rows.

#### Index Scan with Filter
```sql
EXPLAIN SELECT * FROM users WHERE age > 25 AND name LIKE 'John%';
```

```
Index Scan using idx_users_age on users  (cost=0.28..45.67 rows=50 width=64)
  Index Cond: (age > 25)
  Filter: (name ~~ 'John%'::text)
  Rows Removed by Filter: 450
```

Uses index for `age`, applies `name` filter after fetching rows.

### Backward Index Scan
```sql
CREATE INDEX idx_users_created ON users(created_at);

EXPLAIN SELECT * FROM users ORDER BY created_at DESC LIMIT 10;
```

```
Limit  (cost=0.28..0.89 rows=10 width=64)
  -> Index Scan Backward using idx_users_created on users  (cost=0.28..60.78 rows=1000 width=64)
```

Scans index in reverse order (efficient for DESC sorts).

## Index Only Scan

### What It Is
Retrieves data entirely from the index without accessing the table.

```sql
CREATE INDEX idx_users_age ON users(age);

EXPLAIN SELECT age FROM users WHERE age > 25;
```

```
Index Only Scan using idx_users_age on users  (cost=0.28..18.50 rows=500 width=4)
  Index Cond: (age > 25)
```

### When It's Possible
All columns in SELECT and WHERE must be in the index:

```sql
-- Index only scan possible
CREATE INDEX idx_users_age_name ON users(age, name);
SELECT age, name FROM users WHERE age > 25;

-- Index only scan NOT possible (email not in index)
SELECT age, name, email FROM users WHERE age > 25;
```

### Visibility Map Requirement
PostgreSQL must check if rows are visible to your transaction. Index Only Scan requires the **visibility map** to be up-to-date.

```sql
-- Update visibility map
VACUUM users;

-- Now Index Only Scan works better
EXPLAIN ANALYZE SELECT age FROM users WHERE age > 25;
```

```
Index Only Scan using idx_users_age on users  (cost=0.28..18.50 rows=500 width=4) (actual time=0.015..0.085 rows=487 loops=1)
  Index Cond: (age > 25)
  Heap Fetches: 0  -- Good! No heap access needed
```

If `Heap Fetches > 0`, visibility map is incomplete (run VACUUM).

### Covering Indexes
Create indexes specifically to enable Index Only Scans:

```sql
-- Slow: Index Scan (must fetch name from heap)
SELECT name FROM users WHERE age = 25;

-- Fast: Index Only Scan
CREATE INDEX idx_users_age_name ON users(age, name);
SELECT name FROM users WHERE age = 25;
```

## Bitmap Heap Scan

### What It Is
A two-phase scan that's more efficient than Index Scan for moderately selective queries:

1. **Bitmap Index Scan**: Build bitmap of matching heap pages
2. **Bitmap Heap Scan**: Scan those pages once, in physical order

```sql
EXPLAIN SELECT * FROM users WHERE age > 25 AND age < 35;
```

```
Bitmap Heap Scan on users  (cost=12.50..45.23 rows=200 width=64)
  Recheck Cond: ((age > 25) AND (age < 35))
  -> Bitmap Index Scan on idx_users_age  (cost=0.00..12.45 rows=200 width=0)
        Index Cond: ((age > 25) AND (age < 35))
```

### When It's Used
- Moderate selectivity (between seq scan and index scan)
- Typically 5-25% of table rows
- Multiple indexes being combined (OR conditions)

### Why It's Better Than Index Scan
Index Scan fetches rows in index order (random heap access).
Bitmap Scan fetches rows in physical order (sequential heap access).

Example:
```
Users table (10,000 rows):
- Index Scan: 1000 random heap reads
- Bitmap Scan: Maybe 200 sequential page reads (multiple rows per page)
```

### Bitmap Combines Multiple Indexes

#### BitmapOr (OR conditions)
```sql
EXPLAIN SELECT * FROM users
WHERE age < 20 OR age > 80;
```

```
Bitmap Heap Scan on users  (cost=24.75..68.50 rows=150 width=64)
  Recheck Cond: ((age < 20) OR (age > 80))
  -> BitmapOr  (cost=24.75..24.75 rows=150 width=0)
        -> Bitmap Index Scan on idx_users_age  (cost=0.00..12.00 rows=75 width=0)
              Index Cond: (age < 20)
        -> Bitmap Index Scan on idx_users_age  (cost=0.00..12.00 rows=75 width=0)
              Index Cond: (age > 80)
```

Combines bitmaps from both scans (union).

#### BitmapAnd (AND conditions)
```sql
CREATE INDEX idx_users_age ON users(age);
CREATE INDEX idx_users_city ON users(city);

EXPLAIN SELECT * FROM users
WHERE age > 25 AND city = 'Boston';
```

```
Bitmap Heap Scan on users  (cost=28.50..55.75 rows=50 width=64)
  Recheck Cond: ((age > 25) AND (city = 'Boston'::text))
  -> BitmapAnd  (cost=28.50..28.50 rows=50 width=0)
        -> Bitmap Index Scan on idx_users_age  (cost=0.00..12.00 rows=500 width=0)
              Index Cond: (age > 25)
        -> Bitmap Index Scan on idx_users_city  (cost=0.00..15.00 rows=100 width=0)
              Index Cond: (city = 'Boston'::text)
```

Combines bitmaps from both scans (intersection).

### Recheck Cond
Bitmap scans may lose precision (store page-level, not row-level bitmaps in memory-constrained scenarios):

```
Bitmap Heap Scan on users
  Recheck Cond: (age > 25)
```

After fetching a page, PostgreSQL rechecks the condition on each row.

## TID Scan (Tuple ID Scan)

### What It Is
Direct access to specific rows by their physical location (ctid).

```sql
EXPLAIN SELECT * FROM users WHERE ctid = '(0,1)';
```

```
Tid Scan on users  (cost=0.00..4.01 rows=1 width=64)
  TID Cond: (ctid = '(0,1)'::tid)
```

### When It's Used
- Rarely in application queries
- Used internally by PostgreSQL
- Useful for low-level debugging

```sql
-- See ctid (physical row location)
SELECT ctid, * FROM users LIMIT 5;
```

## Comparing Scan Methods

### Cost Comparison Example

```sql
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name TEXT,
    category TEXT,
    price NUMERIC
);

INSERT INTO products (name, category, price)
SELECT
    'Product ' || i,
    CASE (i % 10)
        WHEN 0 THEN 'Electronics'
        WHEN 1 THEN 'Books'
        WHEN 2 THEN 'Clothing'
        ELSE 'Other'
    END,
    10 + (random() * 1000)::numeric
FROM generate_series(1, 100000) i;

CREATE INDEX idx_products_category ON products(category);
ANALYZE products;
```

#### Query 1: High Selectivity (0.1% of rows)
```sql
EXPLAIN ANALYZE SELECT * FROM products WHERE id = 42;
```

Result: **Index Scan** (fastest for single row)

#### Query 2: Moderate Selectivity (10% of rows)
```sql
EXPLAIN ANALYZE SELECT * FROM products WHERE category = 'Electronics';
```

Result: **Bitmap Heap Scan** (combines efficiency of both)

#### Query 3: Low Selectivity (70% of rows)
```sql
EXPLAIN ANALYZE SELECT * FROM products WHERE category != 'Electronics';
```

Result: **Sequential Scan** (reading most of table anyway)

## Influencing Scan Method Choice

### Force Sequential Scan
```sql
SET enable_indexscan = off;
SET enable_bitmapscan = off;

EXPLAIN SELECT * FROM users WHERE age = 25;
-- Will use Seq Scan even if index exists
```

### Force Index Scan
```sql
SET enable_seqscan = off;

EXPLAIN SELECT * FROM users WHERE age > 20;
-- Will use Index Scan even if Seq Scan is cheaper
```

**Note**: These are for testing only. Don't use in production!

### Better: Fix Statistics
```sql
-- If planner makes wrong choice, update statistics
ANALYZE users;

-- Or increase statistics target for specific column
ALTER TABLE users ALTER COLUMN age SET STATISTICS 1000;
ANALYZE users;
```

## Practical Guidelines

### When to Expect Each Scan Type

**Sequential Scan**:
- Small tables (< 10 pages)
- No suitable index
- Retrieving > 25% of rows
- Need all rows

**Index Scan**:
- Retrieving specific row(s) (< 1% of table)
- ORDER BY with LIMIT and matching index
- Very selective filter

**Index Only Scan**:
- All needed columns in index
- Visibility map up-to-date (VACUUM regularly)
- Selective filter

**Bitmap Heap Scan**:
- Moderate selectivity (5-25% of rows)
- Multiple indexes combined (OR/AND)
- Sequential heap access preferred

## Key Takeaways

- **Sequential Scan**: Reads entire table, efficient for large result sets
- **Index Scan**: Uses B-tree index, efficient for selective queries
- **Index Only Scan**: Never touches table, requires covering index
- **Bitmap Heap Scan**: Two-phase scan, efficient for moderate selectivity
- The planner chooses based on estimated selectivity and costs
- Run ANALYZE to keep statistics fresh for good choices
- Watch for "Rows Removed by Filter" (sign of inefficient filtering)

Next, we'll explore join methods and how PostgreSQL combines data from multiple tables!
