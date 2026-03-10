---
title: "VACUUM and Indexes"
description: "Understand how VACUUM cleans up index entries pointing to dead tuples, how index bloat accumulates, and when REINDEX is needed"
estimatedMinutes: 40
---

# VACUUM and Indexes

When a tuple becomes dead, it is not only the heap (table) that holds stale data — every index on the table also has entries pointing to the dead tuple. VACUUM must clean both the heap and all indexes. Understanding this interaction is important because index cleanup is often the most expensive part of VACUUM, and index bloat follows different rules than table bloat.

## How Index Entries Become Dead

When you UPDATE or DELETE a row, the heap tuple gets `xmax` set, marking it as dead. But the index entries still point to the old tuple location:

```
Index B-tree                    Heap
┌─────────┐                 ┌──────────┐
│ key: 42 ├────────────────►│ (dead)   │  ← old tuple
│ key: 42 ├────────────────►│ (live)   │  ← new tuple (from UPDATE)
└─────────┘                 └──────────┘
```

After an UPDATE, there are two index entries for the same key — one pointing to the dead tuple and one to the new tuple. This is true for every index on the table.

**Exception**: HOT (Heap-Only Tuple) updates avoid creating new index entries. The old index entry points to the old tuple, which has a forwarding pointer to the new tuple. This is why HOT updates are so much cheaper.

## VACUUM's Index Cleanup Phases

VACUUM processes indexes in distinct phases, visible in `pg_stat_progress_vacuum`:

1. **Scanning heap**: Reads heap pages to find dead tuple TIDs (page, offset pairs)
2. **Vacuuming indexes**: For each index on the table, scans the entire index to find and remove entries pointing to dead TIDs
3. **Vacuuming heap**: Marks dead tuples as free space in the heap
4. **Cleaning up indexes**: Final pass to handle any remaining dead entries

The index vacuum phase scans **every index completely** for each batch of dead TIDs. If a table has 5 indexes, VACUUM does 5 full index scans.

### The maintenance_work_mem Bottleneck

VACUUM collects dead TIDs in memory, limited by `maintenance_work_mem` (default 64 MB). Each TID is 6 bytes, so 64 MB holds approximately 11 million TIDs.

If there are more dead tuples than fit in memory, VACUUM must do multiple passes:

1. Collect dead TIDs until memory is full (~11M TIDs)
2. Scan ALL indexes to remove entries for those TIDs
3. Clean the heap for those TIDs
4. Go back to step 1 for the next batch

On a table with 50 million dead tuples and 5 indexes, this means 5 × 5 = 25 index scans instead of 5. Increasing `maintenance_work_mem` reduces the number of passes:

```sql
-- Increase for vacuum operations
SET maintenance_work_mem = '1GB';
VACUUM large_table;
```

Or globally:

```sql
ALTER SYSTEM SET maintenance_work_mem = '512MB';
SELECT pg_reload_conf();
```

## Index Bloat

Even after VACUUM removes dead index entries, the index does not shrink. Like heap pages, index pages are not returned to the OS — they are marked as available for new entries but the file size stays the same.

Index bloat is often worse than table bloat because:

1. **Indexes are densely packed**: A small number of dead entries per page still wastes significant space
2. **B-tree page splits are permanent**: When a page splits during insertion, the split is never reversed even if most entries are later deleted
3. **Multiple indexes multiply the problem**: Each index on a table accumulates bloat independently

### Measuring Index Bloat

```sql
-- Index sizes for a table
SELECT
  indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS times_used,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE relname = 'my_table'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Using pgstattuple on Indexes

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;

-- B-tree specific statistics
SELECT * FROM pgstatindex('my_index_name');
```

The output includes:
- **leaf_fragmentation**: How scattered the leaf pages are (higher = more fragmented)
- **avg_leaf_density**: Average fill percentage of leaf pages (lower = more wasted space)
- **empty_pages**: Pages with no entries at all (wasted space)

A healthy B-tree index has:
- `avg_leaf_density` above 70%
- `leaf_fragmentation` below 30%
- Few `empty_pages` relative to total `leaf_pages`

## REINDEX: Rebuilding Indexes

`REINDEX` drops and rebuilds an index from scratch, eliminating all bloat:

```sql
-- Check size before
SELECT pg_size_pretty(pg_relation_size('my_index'));

-- Rebuild the index
REINDEX INDEX my_index;

-- Check size after
SELECT pg_size_pretty(pg_relation_size('my_index'));
```

### REINDEX Variants

```sql
-- Rebuild a specific index
REINDEX INDEX my_index;

-- Rebuild all indexes on a table
REINDEX TABLE my_table;

-- Rebuild all indexes in a database
REINDEX DATABASE mydb;

-- Concurrent reindex (PostgreSQL 12+, does not block writes)
REINDEX INDEX CONCURRENTLY my_index;
```

### REINDEX vs REINDEX CONCURRENTLY

| Aspect | REINDEX | REINDEX CONCURRENTLY |
|--------|---------|---------------------|
| Lock | ACCESS EXCLUSIVE (blocks reads and writes) | Does not block normal operations |
| Duration | Faster | Slower (2 scans of table) |
| Disk space | Drops old, creates new in-place | Creates new first, then drops old (needs 2x space) |
| Production safe | No | Yes |
| Available since | Always | PostgreSQL 12 |

In production, always use `REINDEX CONCURRENTLY` to avoid blocking queries.

## When to REINDEX

### Automatic Indicators

```sql
-- Find bloated indexes (comparing actual size to estimated minimum size)
SELECT
  i.indexrelname AS index_name,
  i.relname AS table_name,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
  pg_size_pretty(pg_relation_size(i.relid)) AS table_size,
  CASE WHEN pg_relation_size(i.relid) > 0
    THEN round(100.0 * pg_relation_size(i.indexrelid) / pg_relation_size(i.relid), 1)
    ELSE 0
  END AS index_to_table_pct
FROM pg_stat_user_indexes i
WHERE pg_relation_size(i.indexrelid) > 10 * 1024 * 1024  -- > 10 MB
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

Warning signs:
- Index size significantly larger than table size (for a single-column index, should be much smaller)
- Index-to-table ratio growing over time
- `avg_leaf_density` below 50% in `pgstatindex`

### After Major Data Changes

After a large DELETE or UPDATE operation, both the table and indexes accumulate bloat. VACUUM cleans dead entries but does not compact the index:

```sql
-- After deleting 90% of a table's rows
DELETE FROM old_data WHERE created_at < '2023-01-01';
VACUUM old_data;

-- The table reuses space, but indexes still bloated
-- Check index sizes
SELECT
  indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE relname = 'old_data';

-- Rebuild if they are too large
REINDEX TABLE CONCURRENTLY old_data;
```

## Index-Only Scan Impact

Bloated indexes affect **index-only scans** in two ways:

1. **More index pages to read**: A bloated index has more pages, so the index scan itself is slower
2. **Visibility map checks**: PostgreSQL must check the visibility map for each heap page referenced by the index. If the table also has dead tuples (visibility map not all-visible), it falls back to regular index scans

This is another reason to keep both table and index bloat under control — they compound each other's performance impact.

## The VACUUM Index Cleanup Skip (PostgreSQL 12+)

PostgreSQL 12 introduced `INDEX_CLEANUP` option for VACUUM:

```sql
-- Skip index cleanup (faster, but leaves dead index entries)
VACUUM (INDEX_CLEANUP OFF) my_table;

-- Force index cleanup (default)
VACUUM (INDEX_CLEANUP ON) my_table;

-- Auto-decide based on dead tuple count
VACUUM (INDEX_CLEANUP AUTO) my_table;  -- Default in PG14+
```

`INDEX_CLEANUP OFF` skips the index scanning phase entirely, making VACUUM much faster. This is useful when you need to quickly reclaim heap space but can tolerate some index bloat temporarily.

`INDEX_CLEANUP AUTO` (default since PG 14) skips index cleanup when there are very few dead tuples, avoiding unnecessary full index scans for minimal benefit.

## Parallel Index Vacuum (PostgreSQL 13+)

PostgreSQL 13 added the ability to vacuum multiple indexes in parallel:

```sql
-- Vacuum with parallel index cleanup (up to 2 parallel workers)
VACUUM (PARALLEL 2) my_table;
```

By default, `VACUUM (PARALLEL 0)` disables parallelism. With `PARALLEL N`, up to N workers handle index vacuuming simultaneously. This is especially beneficial for tables with many indexes.

The maximum number of parallel workers is limited by `max_parallel_maintenance_workers`.

## Key Takeaways

- VACUUM must scan every index on a table to remove entries pointing to dead tuples
- Index cleanup is often the most expensive phase of VACUUM
- `maintenance_work_mem` controls how many dead TIDs are batched per index scan pass
- Index bloat persists after VACUUM — use REINDEX to compact
- `REINDEX CONCURRENTLY` is safe for production (no blocking)
- Monitor index bloat with `pgstatindex` and index size ratios
- `INDEX_CLEANUP OFF` can speed up VACUUM when index bloat is acceptable temporarily
- Parallel VACUUM (PG 13+) speeds up multi-index tables

> **Real-World Example (Spare)**
>
> Several Spare tables have indexes that far exceed the table data in size.
> `LastVehicleLocation` is the most extreme: **1.8 GB of table data vs 8.5 GB
> of indexes** (82% of total size is indexes). `Slot` has 39 GB of data but
> 67 GB of indexes. When VACUUM runs on these tables, it must scan every one
> of those oversized indexes to remove dead entries — making index cleanup
> the dominant cost of VACUUM operations.
>
> **Try It Yourself**: Open Metabase and run:
> ```sql
> SELECT relname,
>   pg_size_pretty(pg_relation_size(relid)) AS table_size,
>   pg_size_pretty(pg_indexes_size(relid)) AS index_size,
>   ROUND(100.0 * pg_indexes_size(relid) / NULLIF(pg_total_relation_size(relid), 0), 1) AS index_pct
> FROM pg_stat_user_tables
> WHERE schemaname = 'public'
> ORDER BY pg_indexes_size(relid)::float / NULLIF(pg_relation_size(relid), 1) DESC
> LIMIT 10;
> ```

In the next lesson, we will examine how long-running transactions can block VACUUM from doing its job.
