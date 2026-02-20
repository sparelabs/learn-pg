---
title: Understanding EXPLAIN Output
description: Master reading and interpreting EXPLAIN and EXPLAIN ANALYZE output
estimatedMinutes: 50
---

# Understanding EXPLAIN Output

`EXPLAIN` is your window into the query planner's decisions. It shows you the execution plan PostgreSQL has chosen for your query. Mastering EXPLAIN is essential for query optimization.

## Basic EXPLAIN

The simplest form shows the plan without executing the query:

```sql
EXPLAIN
SELECT * FROM users WHERE age > 25;
```

Output:
```
Seq Scan on users  (cost=0.00..18.50 rows=500 width=64)
  Filter: (age > 25)
```

## EXPLAIN Formats

### Text Format (Default)
```sql
EXPLAIN SELECT ...;
```
Human-readable tree structure.

### JSON Format
```sql
EXPLAIN (FORMAT JSON) SELECT ...;
```
Machine-parseable, good for tools.

### YAML Format
```sql
EXPLAIN (FORMAT YAML) SELECT ...;
```

### XML Format
```sql
EXPLAIN (FORMAT XML) SELECT ...;
```

## EXPLAIN Options

### ANALYZE: Execute and Show Actual Timings
```sql
EXPLAIN ANALYZE
SELECT * FROM users WHERE age > 25;
```

Output:
```
Seq Scan on users  (cost=0.00..18.50 rows=500 width=64) (actual time=0.023..0.156 rows=487 loops=1)
  Filter: (age > 25)
  Rows Removed by Filter: 113
Planning Time: 0.083 ms
Execution Time: 0.189 ms
```

**Important**: ANALYZE actually runs the query! Be careful with INSERT/UPDATE/DELETE.

### BUFFERS: Show Buffer Usage
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM users WHERE age > 25;
```

Shows:
- Shared blocks hit (in cache)
- Shared blocks read (from disk)
- Temp blocks read/written

```
Seq Scan on users  (cost=0.00..18.50 rows=500 width=64) (actual time=0.023..0.156 rows=487 loops=1)
  Filter: (age > 25)
  Rows Removed by Filter: 113
  Buffers: shared hit=8
Planning Time: 0.083 ms
Execution Time: 0.189 ms
```

### VERBOSE: Show More Details
```sql
EXPLAIN (VERBOSE)
SELECT name, age FROM users WHERE age > 25;
```

Shows output column list and more details about each node.

### COSTS: Control Cost Display
```sql
EXPLAIN (COSTS OFF)
SELECT * FROM users WHERE age > 25;
```

Hides cost estimates (useful for stable test output).

## Reading EXPLAIN Output

### The Plan Tree Structure

Plans are read **bottom-up** and **inside-out**:

```
Hash Join  (cost=...)
  -> Seq Scan on orders
  -> Hash  (cost=...)
       -> Index Scan on users
```

Execution order:
1. Index Scan on users
2. Hash (build hash table)
3. Seq Scan on orders
4. Hash Join (probe hash table)

### Cost Format

```
(cost=0.00..18.50 rows=500 width=64)
```

Breaking it down:
- **cost=0.00..18.50**:
  - First number: Startup cost (cost before first row)
  - Second number: Total cost (cost to retrieve all rows)
- **rows=500**: Estimated number of rows returned
- **width=64**: Estimated average row width in bytes

### Understanding Cost Numbers

Costs are in arbitrary units, roughly equivalent to disk page reads. Important points:

1. **Relative, not absolute**: Compare costs between plans, not absolute values
2. **Estimates**: Based on statistics, may be wrong if stats are stale
3. **Lower is better**: Planner chooses lowest-cost plan

### Actual vs. Estimated (with ANALYZE)

```
Seq Scan on users  (cost=0.00..18.50 rows=500 width=64) (actual time=0.023..0.156 rows=487 loops=1)
```

Additional fields with ANALYZE:
- **actual time=0.023..0.156**:
  - First: Time until first row (milliseconds)
  - Second: Time until last row
- **rows=487**: Actual rows returned
- **loops=1**: Number of times this node executed

### Comparing Estimates to Actuals

Watch for big discrepancies:

```
(cost=... rows=10 ...) (actual ... rows=10000 loops=1)
```

If estimated rows << actual rows:
- Statistics are out of date (run ANALYZE)
- Planner's selectivity estimate is wrong
- May have chosen a suboptimal plan

## Common EXPLAIN Patterns

### Pattern 1: Simple Sequential Scan

```sql
EXPLAIN SELECT * FROM products WHERE price > 100;
```

```
Seq Scan on products  (cost=0.00..35.50 rows=12 width=120)
  Filter: (price > 100::numeric)
```

Reading entire table, filtering rows.

### Pattern 2: Index Scan

```sql
EXPLAIN SELECT * FROM products WHERE product_id = 42;
```

```
Index Scan using products_pkey on products  (cost=0.28..8.29 rows=1 width=120)
  Index Cond: (product_id = 42)
```

Using index to find specific row(s).

### Pattern 3: Index Only Scan

```sql
CREATE INDEX idx_product_price ON products(price);

EXPLAIN SELECT price FROM products WHERE price > 100;
```

```
Index Only Scan using idx_product_price on products  (cost=0.28..8.42 rows=12 width=4)
  Index Cond: (price > 100::numeric)
```

All needed data is in the index (no table access needed).

### Pattern 4: Bitmap Scans

```sql
EXPLAIN SELECT * FROM products WHERE category = 'Electronics' OR price < 50;
```

```
Bitmap Heap Scan on products  (cost=12.50..45.23 rows=150 width=120)
  Recheck Cond: ((category = 'Electronics'::text) OR (price < 50))
  -> BitmapOr  (cost=12.50..12.50 rows=150 width=0)
        -> Bitmap Index Scan on idx_category  (cost=0.00..6.00 rows=100 width=0)
              Index Cond: (category = 'Electronics'::text)
        -> Bitmap Index Scan on idx_price  (cost=0.00..6.00 rows=50 width=0)
              Index Cond: (price < 50)
```

Combines multiple indexes, then scans heap once.

### Pattern 5: Nested Loop Join

```sql
EXPLAIN
SELECT * FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE c.city = 'Boston';
```

```
Nested Loop  (cost=0.56..156.78 rows=50 width=200)
  -> Index Scan using idx_customer_city on customers c  (cost=0.28..12.45 rows=10 width=100)
        Index Cond: (city = 'Boston'::text)
  -> Index Scan using idx_order_customer on orders o  (cost=0.28..14.35 rows=5 width=100)
        Index Cond: (customer_id = c.id)
```

For each customer in Boston, find their orders.

### Pattern 6: Hash Join

```sql
EXPLAIN
SELECT * FROM orders o
JOIN products p ON o.product_id = p.id;
```

```
Hash Join  (cost=45.00..198.50 rows=1000 width=200)
  Hash Cond: (o.product_id = p.id)
  -> Seq Scan on orders o  (cost=0.00..95.00 rows=1000 width=100)
  -> Hash  (cost=25.00..25.00 rows=500 width=100)
        -> Seq Scan on products p  (cost=0.00..25.00 rows=500 width=100)
```

Build hash table from products, probe with orders.

## Analyzing Performance Issues

### Issue 1: Wrong Row Estimates
```
(cost=... rows=10 ...) (actual ... rows=10000 loops=1)
```

**Solution**: Run `ANALYZE` on the table.

### Issue 2: Sequential Scan Instead of Index
```
Seq Scan on users  (cost=0.00..1500.00 rows=1 width=64)
  Filter: (user_id = 42)
```

**Possible causes**:
- No index exists
- Index exists but planner thinks seq scan is cheaper (small table)
- Statistics are stale

### Issue 3: High Loop Count
```
Index Scan on orders (... rows=100 ...) (actual ... rows=100 loops=1000)
```

Inner side of nested loop executing 1000 times! Consider:
- Different join order
- Hash join instead of nested loop
- Adding indexes

### Issue 4: Large Memory Sorts
```
Sort  (cost=... ...) (actual ... rows=1000000 loops=1)
  Sort Key: created_at
  Sort Method: external merge  Disk: 48576kB
```

Sorting to disk is slow. Solutions:
- Increase `work_mem`
- Add index on sort column
- Reduce rows before sorting

## BUFFERS Analysis

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM large_table WHERE id < 1000;
```

```
Seq Scan on large_table (...)
  Buffers: shared hit=8450 read=1550
```

- **shared hit=8450**: Found 8450 pages in shared_buffers (cache)
- **shared read=1550**: Read 1550 pages from disk

**Cache hit ratio**: 8450 / (8450 + 1550) = 84.5%

Low hit ratio suggests:
- Query is reading data not in cache
- shared_buffers might be too small
- Query might benefit from indexes

## Tips for Using EXPLAIN

1. **Always use ANALYZE for real issues**: Estimates can be wrong
2. **Watch for estimate vs. actual discrepancies**: Sign of stale stats
3. **Read bottom-up**: Start at leaves of tree
4. **Look for expensive nodes**: High cost or actual time
5. **Check join methods**: Nested loop with many loops is often bad
6. **Use BUFFERS for I/O analysis**: See what's cached vs. disk
7. **Compare alternative queries**: Test different approaches

## Practical Example

```sql
-- Problem: Slow query
EXPLAIN ANALYZE
SELECT u.name, COUNT(*)
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2023-01-01'
GROUP BY u.name;
```

Look for:
- Seq scans on large tables
- High loop counts on nested loops
- Large estimate/actual differences
- Sorts spilling to disk
- Low buffer hit rates

Then optimize based on what you find!

## Key Takeaways

- `EXPLAIN` shows the query plan, `EXPLAIN ANALYZE` executes and shows actual performance
- Read plans bottom-up and inside-out
- Cost format: `(cost=startup..total rows=N width=W)`
- Watch for discrepancies between estimated and actual rows
- Use `BUFFERS` to understand I/O patterns
- Compare estimates to actuals to detect stale statistics

Next, we'll explore specific plan node types in detail!
