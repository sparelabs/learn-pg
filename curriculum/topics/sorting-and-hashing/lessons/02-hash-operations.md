---
title: Hash Operations
description: Understand hash aggregation, hash joins, and how PostgreSQL handles hash operations that exceed memory
estimatedMinutes: 35
---

# Hash Operations

Hashing is the other fundamental building block alongside sorting. PostgreSQL uses hash tables for `GROUP BY` aggregation, `JOIN` operations, and `DISTINCT` elimination. Understanding how hash operations work — and what happens when they exceed memory — is key to tuning query performance.

## Hash Aggregation

When you run a `GROUP BY`, PostgreSQL can use either **HashAggregate** or **GroupAggregate** (sort-based):

### HashAggregate
Builds a hash table keyed by the GROUP BY columns. Each bucket accumulates the aggregate values:

```
HashAggregate  (cost=... rows=5)
  Group Key: category
  Batches: 1  Memory Usage: 24kB
```

- **Batches: 1** means everything fit in memory
- **Memory Usage** shows how much RAM the hash table used
- Fast for moderate numbers of groups

### GroupAggregate
Sorts the data first, then groups consecutive matching rows:

```
GroupAggregate  (cost=... rows=5)
  Group Key: category
  ->  Sort  (cost=...)
```

GroupAggregate needs sorted input but handles unlimited group counts without memory issues (it processes groups one at a time).

## When Hash Aggregation Spills

When the hash table exceeds `work_mem`, PostgreSQL uses **multi-batch** hash aggregation (PostgreSQL 13+):

```
HashAggregate  (cost=... rows=10000)
  Group Key: user_id
  Batches: 4  Memory Usage: 4145kB
```

**Batches > 1** means the hash table was too large for memory. PostgreSQL:
1. Partitions the data into batches based on hash values
2. Processes each batch separately
3. Writes overflow batches to temporary files

This is conceptually similar to the **Grace Hash Join** algorithm from database theory — partition the data by hash value so each partition fits in memory.

## Hash Joins

Hash joins are PostgreSQL's preferred method for equi-joins when both sides are large:

```
Hash Join  (cost=...)
  Hash Cond: (orders.user_id = users.id)
  ->  Seq Scan on orders
  ->  Hash  (cost=...)
        Batches: 1  Memory Usage: 512kB
        ->  Seq Scan on users
```

The algorithm:
1. **Build phase**: Scan the inner table (users), build a hash table on the join key
2. **Probe phase**: Scan the outer table (orders), probe the hash table for matches

Like HashAggregate, hash joins can use multiple batches when the hash table doesn't fit in memory.

## Sort-Based vs Hash-Based Operations

The planner chooses between sorting and hashing based on cost estimates:

| Operation | Sort-Based | Hash-Based |
|-----------|-----------|------------|
| GROUP BY | GroupAggregate (needs sort) | HashAggregate (needs memory) |
| JOIN | Merge Join (needs sorted input) | Hash Join (needs hash table) |
| DISTINCT | Unique (needs sort) | HashAggregate |

You can force the planner to use one or the other for comparison:

```sql
-- Disable hash aggregation to force sort-based
SET enable_hashagg = off;
EXPLAIN (ANALYZE) SELECT category, count(*) FROM products GROUP BY category;

-- Re-enable
SET enable_hashagg = on;
```

**When hash is better**: Few to moderate groups/join keys, large datasets
**When sort is better**: Many groups (hash table too large), data already sorted, or need sorted output

## Monitoring Hash Operations

`EXPLAIN (ANALYZE)` shows key hash metrics:
- **Batches**: Number of hash table partitions (1 = all in memory)
- **Memory Usage**: Actual hash table memory
- **Buckets**: Number of hash buckets (affects collision rate)

When you see high batch counts, it means the operation is spilling to disk. Options:
1. Increase `work_mem` to fit the hash table in memory
2. Consider whether a sort-based alternative would be more efficient
3. Add appropriate indexes to change the join/aggregation strategy

## Key Takeaways

- PostgreSQL uses hash tables for GROUP BY (HashAggregate), JOIN (Hash Join), and DISTINCT
- Hash operations are memory-intensive — they build in-memory hash tables bounded by `work_mem`
- When the hash table exceeds memory, PostgreSQL partitions into multiple batches (disk spill)
- "Batches: 1" in EXPLAIN is good (all in memory); Batches > 1 means disk spill
- The planner chooses between hash-based and sort-based strategies based on cost estimates
- `enable_hashagg = off` forces sort-based aggregation for comparison

Next, we'll tie it all together with work_mem tuning strategies.
