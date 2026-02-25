---
title: work_mem Tuning
description: Learn how to tune work_mem effectively — the per-operation memory budget for sorts and hash tables
estimatedMinutes: 30
---

# work_mem Tuning

`work_mem` is one of PostgreSQL's most impactful tuning parameters. It controls how much memory each sort and hash operation can use before spilling to disk. Set it too low and queries spill to disk unnecessarily. Set it too high and you risk running out of memory.

## work_mem is Per-Operation, Not Per-Query

This is the most important thing to understand about `work_mem`:

```sql
-- This query might use 3x work_mem:
SELECT a.category, b.region, count(*)
FROM products a
JOIN sales b ON a.id = b.product_id
GROUP BY a.category, b.region
ORDER BY count(*) DESC;
```

This query could have:
1. A hash join (uses work_mem for the hash table)
2. A hash aggregate for GROUP BY (uses work_mem)
3. A sort for ORDER BY (uses work_mem)

Each operation independently allocates up to `work_mem`. With 100 concurrent connections, the worst-case memory usage for sort/hash operations alone is:

```
max_memory = connections × operations_per_query × work_mem
```

With 100 connections, 3 operations per query, and work_mem = 64MB:
```
100 × 3 × 64MB = 19.2 GB
```

This is why the default `work_mem` is a conservative 4MB — it must be safe for many concurrent connections.

## Tuning Strategy

### 1. Start with the Default
The default 4MB is reasonable for most workloads. Don't change it globally without reason.

### 2. Set Per-Session for Expensive Queries
For batch jobs, reports, or analytics queries:

```sql
SET work_mem = '256MB';
-- Run your expensive query
RESET work_mem;  -- Return to default
```

### 3. Monitor Disk Spills
Use `log_temp_files` to log when operations spill to disk:

```sql
-- Log any temporary file creation (0 = log all temp files)
SET log_temp_files = 0;
```

When a sort or hash operation spills to disk, PostgreSQL creates temporary files. With `log_temp_files = 0`, every temp file is logged with its size. This tells you exactly which operations are spilling and how much data they're writing.

### 4. Use EXPLAIN (ANALYZE) to Verify

```sql
SET work_mem = '4MB';
EXPLAIN (ANALYZE) SELECT ... ORDER BY ...;
-- Sort Method: external merge  Disk: 15432kB

SET work_mem = '32MB';
EXPLAIN (ANALYZE) SELECT ... ORDER BY ...;
-- Sort Method: quicksort  Memory: 15120kB
```

The sweet spot is where the sort fits in memory without allocating much more than needed.

## Global vs Per-Session Settings

```sql
-- Global default (postgresql.conf or ALTER SYSTEM)
ALTER SYSTEM SET work_mem = '16MB';
SELECT pg_reload_conf();

-- Per-session override
SET work_mem = '256MB';

-- Per-transaction
SET LOCAL work_mem = '256MB';
-- Reverts after COMMIT/ROLLBACK
```

**Best practice**: Keep the global default conservative (4-16MB) and set higher values per-session for specific workloads:
- OLTP queries (simple lookups): 4MB is fine
- Analytics/reporting: 64-256MB
- Batch processing: 256MB-1GB
- One-off admin queries: as much as needed

## Related Parameters

### hash_mem_multiplier (PostgreSQL 13+)
Multiplies work_mem specifically for hash operations:

```sql
SHOW hash_mem_multiplier;  -- Default: 2.0
```

With work_mem = 4MB and hash_mem_multiplier = 2.0, hash operations can use up to 8MB. This recognizes that hash tables often need more memory than sorts.

### maintenance_work_mem
Separate memory budget for maintenance operations like `CREATE INDEX`, `VACUUM`, and `ALTER TABLE`:

```sql
SHOW maintenance_work_mem;  -- Default: 64MB
```

This can be set much higher than work_mem because maintenance operations are typically single-threaded and infrequent.

## Key Takeaways

- `work_mem` is per-operation, not per-query — a complex query can use multiple times work_mem
- Keep global work_mem conservative (4-16MB) to be safe with many connections
- Set higher work_mem per-session for analytics, batch jobs, and reports
- Use `log_temp_files = 0` to identify operations that spill to disk
- Use `EXPLAIN (ANALYZE)` to see Sort Method and Hash Batches — your guide to whether work_mem is sufficient
- `hash_mem_multiplier` gives extra memory headroom specifically for hash operations
- `maintenance_work_mem` is separate and can be set much higher for CREATE INDEX and VACUUM

This completes our tour of sorting and hashing. You now understand the building blocks of query execution — how PostgreSQL sorts data (quicksort, external merge, top-N heapsort), how it hashes data (hash aggregate, hash join, multi-batch), and how to tune the memory budget that controls the boundary between fast in-memory operations and slow disk spills.
