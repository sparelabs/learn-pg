---
title: Plan Node Types - Join Methods
description: Learn about Nested Loop, Hash Join, and Merge Join strategies
estimatedMinutes: 60
---

# Plan Node Types: Join Methods

When your query combines data from multiple tables, PostgreSQL must choose a join strategy. The planner has three main join methods, each optimal for different scenarios. Understanding these helps you write efficient joins and diagnose performance issues.

## The Three Join Methods

1. **Nested Loop Join**: For each row in outer table, scan inner table
2. **Hash Join**: Build hash table from one side, probe with other
3. **Merge Join**: Sort both sides, merge in order

Let's explore each in detail.

## Nested Loop Join

### What It Is
The simplest join algorithm:
```
For each row in outer table:
    For each row in inner table:
        If join condition matches:
            Output joined row
```

### EXPLAIN Output
```sql
EXPLAIN
SELECT *
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE c.city = 'Boston';
```

```
Nested Loop  (cost=0.56..156.78 rows=50 width=200)
  -> Index Scan using idx_customer_city on customers c  (cost=0.28..12.45 rows=10 width=100)
        Index Cond: (city = 'Boston'::text)
  -> Index Scan using idx_order_customer on orders o  (cost=0.28..14.35 rows=5 width=100)
        Index Cond: (customer_id = c.id)
```

Read bottom-up:
1. Find 10 customers in Boston (outer loop)
2. For each customer, find their orders using index (inner loop)
3. Total: 10 iterations of inner scan

### When It's Optimal

#### Small Outer Table
```sql
-- 5 customers in Boston, each has 100 orders
SELECT *
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE c.city = 'Boston';
```

If you have an index on `orders.customer_id`, you do:
- 5 index lookups (very fast)
- Total: ~5 ms

#### Index on Join Column
Nested Loop shines when inner table has an index on the join column:

```sql
CREATE INDEX idx_orders_customer_id ON orders(customer_id);

-- Fast nested loop
SELECT *
FROM customers c
JOIN orders o ON c.id = o.customer_id
WHERE c.id = 42;
```

Without index, inner table needs full scan for each outer row (slow!).

#### Parameterized Paths
The inner side can use values from the outer side:

```sql
Nested Loop
  -> Seq Scan on customers c
       Filter: (city = 'Boston')
  -> Index Scan using idx_orders_customer on orders o
       Index Cond: (customer_id = c.id)  -- Uses c.id from outer
```

This is called a "parameterized path" and is very efficient.

### When It's Slow

#### Large Outer Table, No Index
```sql
-- BAD: 10,000 customers, no index on orders.customer_id
SELECT *
FROM customers c
JOIN orders o ON c.id = o.customer_id;
```

Result:
```
Nested Loop  (cost=0.00..50000000.00 rows=1000000 width=200)
  -> Seq Scan on customers c
  -> Seq Scan on orders o
       Filter: (customer_id = c.id)
```

For each of 10,000 customers, scan all orders table (disaster!).

### Cost Calculation
```
Cost = (outer_rows * inner_cost) + outer_cost

If outer has 10 rows and inner scan costs 14:
Cost = (10 * 14) + 12 = 152
```

### Nested Loop Variations

#### Regular Nested Loop
```sql
Nested Loop  (cost=...)
  -> Seq Scan on table_a
  -> Index Scan on table_b
       Index Cond: (table_b.id = table_a.id)
```

#### Nested Loop with Materialization
```sql
Nested Loop  (cost=...)
  -> Seq Scan on table_a
  -> Materialize  (cost=...)
       -> Seq Scan on table_b
```

Inner side is materialized (cached in memory) to avoid repeated scans.

## Hash Join

### What It Is
Build a hash table from one side, probe with the other:

```
1. Scan "build" side, insert into hash table (key = join column)
2. Scan "probe" side, look up each row in hash table
3. Output matches
```

### EXPLAIN Output
```sql
EXPLAIN
SELECT *
FROM orders o
JOIN products p ON o.product_id = p.id;
```

```
Hash Join  (cost=45.00..198.50 rows=1000 width=200)
  Hash Cond: (o.product_id = p.id)
  -> Seq Scan on orders o  (cost=0.00..95.00 rows=1000 width=100)
  -> Hash  (cost=25.00..25.00 rows=500 width=100)
        -> Seq Scan on products p  (cost=0.00..25.00 rows=500 width=100)
```

Read bottom-up:
1. Scan products, build hash table (500 rows)
2. Scan orders (1000 rows)
3. For each order, probe hash table for matching product
4. Output joins

### When It's Optimal

#### Both Tables Are Large
```sql
-- 100,000 orders, 10,000 products
SELECT *
FROM orders o
JOIN products p ON o.product_id = p.id;
```

Hash Join:
- Build hash table from products: O(10,000)
- Probe with orders: O(100,000)
- Total: O(110,000) operations

vs. Nested Loop without index:
- O(100,000 * 10,000) = 1 billion operations!

#### Equi-Joins (Equality Conditions)
Hash Join only works with `=` joins:

```sql
-- Works with hash join
JOIN ON a.id = b.id

-- Cannot use hash join
JOIN ON a.value > b.value
```

#### No Suitable Index
If neither side has an index on join column, Hash Join is often best:

```sql
-- No index on orders.product_id or products.id
SELECT * FROM orders o
JOIN products p ON o.product_id = p.id;
```

Result: Hash Join (better than nested loop)

### Build vs. Probe Side

PostgreSQL builds hash table from **smaller** table:

```sql
Hash Join
  Hash Cond: (orders.product_id = products.id)
  -> Seq Scan on orders       -- Probe side (large)
  -> Hash                      -- Build side (small)
       -> Seq Scan on products
```

Why? Smaller hash table fits in memory (`work_mem`).

### Memory Considerations

Hash table must fit in `work_mem`:

```sql
SHOW work_mem;  -- Default: 4MB
```

If hash table exceeds `work_mem`, it spills to disk (slow):

```sql
Hash Join  (cost=...)
  ...
  -> Hash  (cost=...)
       -> Seq Scan on large_table
       Buckets: 1024  Batches: 8  Memory Usage: 12345kB
```

**Batches > 1**: Hash join is being done in multiple passes (slower).

**Solution**:
```sql
SET work_mem = '256MB';  -- For this session
```

Or add an index to enable Nested Loop instead.

### Cost Calculation
```
Cost = cost_to_build_hash + cost_to_probe

Build: Read all rows from smaller table
Probe: Read all rows from larger table + hash lookups
```

## Merge Join

### What It Is
Sort both sides, then merge in order:

```
1. Sort both tables on join column
2. Scan both in parallel, matching equal values
3. Output matches
```

### EXPLAIN Output
```sql
EXPLAIN
SELECT *
FROM orders o
JOIN customers c ON o.customer_id = c.id
ORDER BY c.id;
```

```
Merge Join  (cost=125.50..245.75 rows=1000 width=200)
  Merge Cond: (c.id = o.customer_id)
  -> Index Scan using customers_pkey on customers c  (cost=0.28..85.50 rows=500 width=100)
  -> Sort  (cost=120.00..125.00 rows=1000 width=100)
        Sort Key: o.customer_id
        -> Seq Scan on orders o  (cost=0.00..95.00 rows=1000 width=100)
```

Read bottom-up:
1. Index scan on customers (already sorted by id)
2. Scan and sort orders by customer_id
3. Merge both sorted streams

### When It's Optimal

#### Data Already Sorted
If one or both sides are already sorted (via index), Merge Join is efficient:

```sql
-- Both sides have indexes on join columns
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_customers_id ON customers(id);  -- PRIMARY KEY

SELECT * FROM orders o
JOIN customers c ON o.customer_id = c.id;
```

Result: No sorting needed!

```
Merge Join  (cost=0.56..156.78 rows=1000 width=200)
  Merge Cond: (c.id = o.customer_id)
  -> Index Scan using customers_pkey on customers c  (cost=0.28..45.50 rows=500 width=100)
  -> Index Scan using idx_orders_customer on orders o  (cost=0.28..95.00 rows=1000 width=100)
```

#### Query Needs Sorted Output
If query requires sorting anyway:

```sql
SELECT *
FROM orders o
JOIN customers c ON o.customer_id = c.id
ORDER BY c.id;
```

Merge Join provides sorted output for free.

#### Non-Equality Joins
Merge Join can handle inequality joins:

```sql
SELECT *
FROM events e1
JOIN events e2 ON e1.time < e2.time;
```

Hash Join can't do this, but Merge Join can (though it's rarely efficient).

### When It's Slow

#### Requires Expensive Sorts
If both sides need sorting and don't fit in memory:

```sql
Merge Join  (cost=5000.00..8000.00 rows=100000 width=200)
  Merge Cond: (a.value = b.value)
  -> Sort  (cost=2500.00..2750.00 rows=50000 width=100)
        Sort Key: a.value
        Sort Method: external merge  Disk: 12345kB  -- SLOW!
        -> Seq Scan on table_a a
  -> Sort  (cost=2500.00..2750.00 rows=50000 width=100)
        Sort Key: b.value
        Sort Method: external merge  Disk: 12345kB  -- SLOW!
        -> Seq Scan on table_b b
```

Sorting to disk is expensive. Hash Join would be better.

## Choosing the Right Join Method

### Decision Factors

| Factor | Nested Loop | Hash Join | Merge Join |
|--------|-------------|-----------|------------|
| Outer table size | Small | Any | Any |
| Inner table size | Any | Large | Large |
| Index on join col | Required | Not needed | Helps |
| Join type | Any | Equality only | Any |
| Data pre-sorted | N/A | N/A | Big advantage |
| Memory available | Low | Needs work_mem | Needs work_mem |

### Example Scenarios

#### Scenario 1: Lookup Join
```sql
-- Find details for 5 specific orders
SELECT * FROM orders o
JOIN products p ON o.product_id = p.id
WHERE o.id IN (1, 2, 3, 4, 5);
```

**Best**: Nested Loop (5 orders × 1 index lookup = 5 lookups)

#### Scenario 2: Large-to-Large Join
```sql
-- Join 1 million orders to 100k products
SELECT * FROM orders o
JOIN products p ON o.product_id = p.id;
```

**Best**: Hash Join (if products fit in work_mem)

#### Scenario 3: Pre-Sorted Data
```sql
-- Both tables clustered on join column
SELECT * FROM orders o
JOIN customers c ON o.customer_id = c.id
ORDER BY c.id;
```

**Best**: Merge Join (no sorting needed, sorted output)

## Multi-Table Joins

For queries joining 3+ tables, the planner must choose:
1. Join order
2. Join method for each pair

### Example
```sql
SELECT *
FROM customers c
JOIN orders o ON c.id = o.customer_id
JOIN products p ON o.product_id = p.id
WHERE c.city = 'Boston';
```

Possible plans:
```
Plan A:
  Hash Join (orders-products)
    -> Nested Loop (customers-orders)
         -> Index Scan on customers (city = 'Boston')
         -> Index Scan on orders
    -> Hash
         -> Seq Scan on products

Plan B:
  Nested Loop (customers-result)
    -> Index Scan on customers (city = 'Boston')
    -> Hash Join (orders-products)
         -> Index Scan on orders
         -> Hash
              -> Seq Scan on products
```

Planner estimates cost of each and chooses best.

## Influencing Join Method Choice

### Disable Specific Methods (Testing Only)
```sql
SET enable_nestloop = off;   -- Force no nested loop
SET enable_hashjoin = off;   -- Force no hash join
SET enable_mergejoin = off;  -- Force no merge join
```

### Better: Provide Better Statistics
```sql
-- Update statistics
ANALYZE orders;
ANALYZE customers;

-- Increase statistics sample for important columns
ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 1000;
ANALYZE orders;
```

### Adjust Memory
```sql
-- Allow larger hash tables
SET work_mem = '256MB';
```

### Add Indexes
```sql
-- Enable efficient nested loop
CREATE INDEX idx_orders_customer_id ON orders(customer_id);

-- Enable merge join without sort
CREATE INDEX idx_orders_customer_sorted ON orders(customer_id);
```

## Common Performance Issues

### Issue 1: Nested Loop with High Loop Count
```sql
Nested Loop  (cost=... rows=10000 ...) (actual ... rows=10000 loops=1)
  -> Seq Scan on large_table1  (cost=... rows=1000 ...)
  -> Materialize  (cost=... rows=100 ...) (actual ... loops=1000)
       -> Seq Scan on large_table2
```

**Problem**: Inner side executed 1000 times, materializing large result.

**Solutions**:
- Add index on join column (enable parameterized nested loop)
- Increase work_mem (enable hash join)
- Review join order

### Issue 2: Hash Join with Multiple Batches
```sql
Hash Join  (cost=...)
  -> Seq Scan on table_a
  -> Hash  (cost=...)
       Buckets: 1024  Batches: 16  Memory Usage: 8192kB
       -> Seq Scan on table_b
```

**Problem**: Hash table too large, using 16 batches (disk I/O).

**Solutions**:
- Increase work_mem
- Add index (enable nested loop)
- Filter data before join

### Issue 3: Merge Join with Slow Sorts
```sql
Merge Join  (cost=...)
  -> Sort  (cost=...)
       Sort Method: external merge  Disk: 102400kB
       -> Seq Scan on table_a
  -> Sort  (cost=...)
       Sort Method: external merge  Disk: 204800kB
       -> Seq Scan on table_b
```

**Problem**: Both sides sorting to disk.

**Solutions**:
- Increase work_mem
- Add indexes on join columns (avoid sorting)
- Use hash join instead

## Practical Tips

1. **Small × Large**: Nested Loop with index on large table
2. **Large × Large**: Hash Join (if memory available)
3. **Pre-sorted data**: Merge Join
4. **Always**: Keep statistics fresh with ANALYZE
5. **Monitor**: Watch for multiple batches, external sorts, high loop counts

## Key Takeaways

- **Nested Loop**: Best for small outer table with index on inner
- **Hash Join**: Best for large-to-large equi-joins
- **Merge Join**: Best when data already sorted or sort needed anyway
- Planner chooses based on table sizes, indexes, and statistics
- Join order matters as much as join method
- Memory (work_mem) significantly affects hash and merge joins
- Watch EXPLAIN ANALYZE for loop counts, batches, and sort methods

Next, we'll explore cost estimation and how PostgreSQL calculates these numbers!
