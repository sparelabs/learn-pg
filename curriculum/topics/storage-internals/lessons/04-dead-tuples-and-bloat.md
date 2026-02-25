---
title: Dead Tuples and Bloat
description: Understand how MVCC creates dead tuples, how to measure table bloat, and the role of VACUUM
estimatedMinutes: 35
---

# Dead Tuples and Bloat

PostgreSQL's MVCC model means that every UPDATE and DELETE leaves behind old row versions — **dead tuples**. Over time, these dead tuples cause tables to grow larger than they need to be. This phenomenon is called **table bloat**.

## How Dead Tuples Accumulate

Every UPDATE in PostgreSQL creates a new tuple and marks the old one as dead. Every DELETE marks a tuple as dead without physically removing it. The dead tuples remain on disk until VACUUM cleans them up.

Consider a table with 10,000 rows. If you update every row once:
- You now have 10,000 live tuples and 10,000 dead tuples
- The table is roughly twice its ideal size
- The dead tuples consume space on pages, reducing how many live tuples fit per page

```sql
CREATE TABLE bloat_demo (id INTEGER, value TEXT);
INSERT INTO bloat_demo SELECT i, 'original' FROM generate_series(1, 10000) i;

-- Check size before updates
SELECT pg_relation_size('bloat_demo') AS before_update;

-- Update every row
UPDATE bloat_demo SET value = 'updated';

-- Check size after updates
SELECT pg_relation_size('bloat_demo') AS after_update;
```

The table will be roughly double its original size after the mass update.

## Monitoring Dead Tuples

PostgreSQL tracks dead tuple counts in the `pg_stat_user_tables` view:

```sql
SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  CASE WHEN n_live_tup > 0
    THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
    ELSE 0
  END AS dead_pct,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC;
```

Key columns:
- **n_live_tup**: Estimated number of live rows
- **n_dead_tup**: Estimated number of dead tuples waiting for VACUUM
- **last_vacuum / last_autovacuum**: When the table was last vacuumed

These are estimates maintained by the statistics collector, not exact counts. They're updated by DML operations and `ANALYZE`.

## Measuring Bloat with pg_relation_size

A simple way to estimate bloat is comparing actual size to ideal size:

```sql
-- Actual size
SELECT pg_size_pretty(pg_relation_size('my_table')) AS actual_size;

-- Ideal size estimate (live tuples * average row width)
SELECT
  pg_size_pretty(
    (SELECT count(*) FROM my_table) *
    (SELECT avg(pg_column_size(my_table.*)) FROM my_table LIMIT 1000)::bigint
  ) AS estimated_ideal_size;
```

This is a rough estimate — it doesn't account for page headers, alignment, or item pointers. For more precise measurement, use `pgstattuple`.

## Precise Bloat Measurement with pgstattuple

The `pgstattuple` extension provides exact bloat statistics:

```sql
SELECT * FROM pgstattuple('bloat_demo');
```

This returns:

| Column | Meaning |
|--------|---------|
| `table_len` | Total table size in bytes |
| `tuple_count` | Number of live tuples |
| `tuple_len` | Total length of live tuples |
| `tuple_percent` | Percentage of space used by live tuples |
| `dead_tuple_count` | Number of dead tuples |
| `dead_tuple_len` | Total length of dead tuples |
| `dead_tuple_percent` | Percentage of space wasted by dead tuples |
| `free_space` | Total free space in bytes |
| `free_percent` | Percentage of free space |

A healthy table has `dead_tuple_percent` near 0 and a reasonable `free_percent` (some free space is normal — it's available for new inserts).

**Warning**: `pgstattuple` performs a full table scan. Don't run it on very large tables in production without considering the I/O impact.

## Why Bloat Matters

Bloated tables cause:

### More I/O
Sequential scans read every page, including pages full of dead tuples. A table with 50% bloat requires reading twice as many pages.

### Larger Indexes
Indexes point to physical tuple locations. Dead tuples still have index entries until VACUUM removes them. This means index scans may visit pages only to find dead tuples.

### Wasted Buffer Cache
Shared buffers cache pages. If half the tuples on cached pages are dead, you're wasting half your cache on useless data.

### Slower VACUUM
The more bloat accumulates, the more work VACUUM has to do. In extreme cases, VACUUM can take hours on heavily bloated tables.

## Introduction to VACUUM

VACUUM is PostgreSQL's garbage collector for dead tuples. It:

1. Scans the table for dead tuples
2. Removes dead tuples and marks their space as reusable
3. Updates the visibility map and free space map
4. Optionally freezes old transaction IDs (prevents wraparound)

```sql
-- Manual vacuum
VACUUM bloat_demo;

-- Verbose output shows what it did
VACUUM VERBOSE bloat_demo;
```

Important: Regular VACUUM **does not** return space to the operating system. It marks space as reusable within the table file. Only `VACUUM FULL` (which rewrites the entire table with an exclusive lock) shrinks the file.

### Autovacuum

PostgreSQL runs autovacuum automatically. It monitors dead tuple counts and triggers VACUUM when they exceed a threshold:

```
threshold = autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor * n_live_tup
```

Default: vacuum when dead tuples exceed 50 + 20% of live tuples.

For tables with heavy update/delete patterns, you may need to tune these thresholds lower:

```sql
-- More aggressive autovacuum for a specific table
ALTER TABLE busy_table SET (
  autovacuum_vacuum_threshold = 100,
  autovacuum_vacuum_scale_factor = 0.05
);
```

We'll cover VACUUM in much more detail in the Operational Health topic. For now, the key point is: dead tuples are normal, VACUUM cleans them up, and you should ensure autovacuum is running effectively.

## Key Takeaways

- Every UPDATE/DELETE creates dead tuples that occupy space until VACUUM cleans them
- Monitor dead tuples with `pg_stat_user_tables` (`n_dead_tup`, `n_live_tup`)
- Bloat increases I/O, wastes buffer cache, and slows sequential scans
- `pg_relation_size()` shows actual table size; compare before/after bulk operations
- `pgstattuple` provides precise bloat measurements (dead_tuple_count, dead_tuple_percent)
- Regular VACUUM reclaims space for reuse within the table; VACUUM FULL shrinks the file
- Autovacuum handles this automatically, but may need tuning for high-write tables

This completes our tour of PostgreSQL storage internals. You now understand how data is organized on disk (pages, heaps), how large values are handled (TOAST), how rows are addressed (CTIDs), and what happens when rows are updated or deleted (dead tuples, bloat). These concepts are the foundation for understanding query performance and operational health.
