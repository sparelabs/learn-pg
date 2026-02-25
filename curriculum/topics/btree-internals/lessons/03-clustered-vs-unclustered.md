---
title: Clustered vs Unclustered Indexes
description: Learn how physical data ordering affects index scan performance and when to use CLUSTER
estimatedMinutes: 40
---

# Clustered vs Unclustered Indexes

An index tells PostgreSQL where rows are, but the physical order of rows on disk matters enormously for performance. A **clustered** index has rows in the same order as the index keys. An **unclustered** index points to rows scattered randomly across the heap.

## The Clustering Problem

Consider a B+ tree index on a `created_at` column. The index leaf nodes are sorted by date. But the heap pages store rows in insertion order, which might not match the date order (think of concurrent inserts, updates, or bulk loads from different sources).

When you scan a date range using this index:
- **Clustered**: The heap pages are in date order, so you read pages sequentially. One page might contain all rows for a given day.
- **Unclustered**: Each index entry points to a different random page. Reading 100 index entries might require reading 100 different heap pages.

The difference can be 10-100x in I/O cost for range queries.

## Measuring Correlation

PostgreSQL's `pg_stats` view includes a `correlation` column that measures how well the physical row order matches the column's value order:

```sql
SELECT
  attname,
  correlation
FROM pg_stats
WHERE tablename = 'my_table'
  AND attname = 'my_column';
```

- **correlation ≈ 1.0**: Values are in ascending physical order (well clustered)
- **correlation ≈ -1.0**: Values are in descending physical order (reverse clustered)
- **correlation ≈ 0.0**: Random physical order (unclustered)

The planner uses correlation to decide between Index Scan and Bitmap Index Scan. Low correlation makes Index Scan expensive (many random page reads), so the planner may prefer a Bitmap scan (which sorts TIDs by page number before fetching).

## Observing Heap Fetches

`EXPLAIN (ANALYZE, BUFFERS)` reveals the impact of clustering:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders
WHERE created_at BETWEEN '2024-01-01' AND '2024-01-31';
```

With unclustered data, you'll see high `shared read` counts relative to the number of rows returned — each row comes from a different page. With clustered data, fewer page reads are needed because adjacent rows share pages.

## The CLUSTER Command

`CLUSTER` physically reorders the table's heap to match an index:

```sql
-- Reorder the table to match the index
CLUSTER orders USING idx_orders_created_at;
```

After clustering:
- `correlation` will be near 1.0
- Range queries on `created_at` will read far fewer pages
- Sequential patterns replace random I/O

**Important caveats**:
- `CLUSTER` takes an **exclusive lock** on the table — no reads or writes during the operation
- Clustering is **not maintained** — subsequent inserts go wherever there's free space
- You can only cluster on one index at a time (a table can only have one physical order)
- `CLUSTER` rewrites the entire table, which can take a long time for large tables

## Index Only Scans: Avoiding the Heap Entirely

An **Index Only Scan** reads data directly from the index without touching the heap at all. This eliminates the clustering problem entirely — if all columns you need are in the index, physical table order doesn't matter.

```sql
-- If there's an index on (created_at, total)
-- This can use an Index Only Scan:
EXPLAIN SELECT created_at, total FROM orders
WHERE created_at > '2024-01-01';
```

Index Only Scans require:
1. All selected columns are in the index (either as key columns or INCLUDE columns)
2. The visibility map shows the pages are all-visible (recently VACUUMed)

### Covering Indexes with INCLUDE

You can add non-key columns to an index with `INCLUDE`:

```sql
CREATE INDEX idx_orders_date_covering ON orders (created_at)
INCLUDE (total, status);
```

The `INCLUDE` columns are stored in leaf pages but are not part of the search key. This enables Index Only Scans without making the index key wider (which would reduce fanout).

## When to Use CLUSTER

Cluster when:
- You have a dominant range query pattern on a specific column
- The table is mostly read-heavy (writes are infrequent)
- You can tolerate the downtime for the exclusive lock
- The query improvement justifies the maintenance overhead

Don't cluster when:
- The table has high write volume (clustering degrades quickly)
- You need good performance on multiple different range queries (can only cluster on one index)
- You can achieve the same benefit with covering indexes or partitioning

## Key Takeaways

- Clustered indexes have table rows in the same order as index keys — dramatically faster for range scans
- `correlation` in `pg_stats` measures how well-clustered a column is (1.0 = perfect, 0.0 = random)
- `CLUSTER` command reorders the table but requires an exclusive lock and isn't maintained
- Index Only Scans avoid the clustering problem entirely by reading only from the index
- Covering indexes with `INCLUDE` enable Index Only Scans for more queries
- The planner considers correlation when choosing between Index Scan and Bitmap Index Scan

Next, we'll look at practical index patterns: multi-column indexes, partial indexes, expression indexes, and choosing the right index type.
