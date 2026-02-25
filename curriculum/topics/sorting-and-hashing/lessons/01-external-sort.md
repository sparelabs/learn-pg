---
title: External Sort
description: Understand how PostgreSQL sorts data using in-memory quicksort, external merge sort, and top-N heapsort
estimatedMinutes: 35
---

# External Sort

Sorting is one of the most fundamental operations in query execution. Every `ORDER BY`, `DISTINCT`, `MERGE JOIN`, and many `GROUP BY` operations need sorted data. PostgreSQL uses different sort algorithms depending on how much data fits in memory.

## Sort Methods in PostgreSQL

When you run `EXPLAIN (ANALYZE)` on a query with sorting, you'll see one of three sort methods:

### 1. In-Memory Quicksort
When the data fits in `work_mem`, PostgreSQL sorts it entirely in memory using quicksort:

```
Sort Method: quicksort  Memory: 3241kB
```

This is the fastest option — no disk I/O for the sort itself. The data is loaded into memory, sorted, and streamed out.

### 2. External Merge Sort (Disk)
When the data exceeds `work_mem`, PostgreSQL spills to disk using an external merge sort:

```
Sort Method: external merge  Disk: 15432kB
```

The algorithm:
1. Read as much data as fits in `work_mem`
2. Sort it in memory (creating a "run")
3. Write the sorted run to a temporary file
4. Repeat for remaining data
5. Merge all sorted runs together

This is the same external sort algorithm taught in database courses. The I/O cost is O(N × log(N/M)) page reads where N is the data size and M is `work_mem`.

### 3. Top-N Heapsort
When the query has `ORDER BY ... LIMIT N` with a small N, PostgreSQL uses a heap (priority queue) to track only the top N rows:

```
Sort Method: top-N heapsort  Memory: 25kB
```

This is extremely efficient for "top K" queries — it only needs to maintain a heap of N elements regardless of how large the input is. No disk spill even for huge tables.

## work_mem: The Memory Budget

`work_mem` controls how much memory each sort operation can use before spilling to disk:

```sql
SHOW work_mem;  -- Default: 4MB
```

Key points about work_mem:
- It's a **per-operation** limit, not per-query. A single query with 3 sorts uses up to 3 × work_mem
- It's a **per-session** setting, not global. Different connections can have different values
- Increasing it reduces disk sorts but increases memory usage across all connections

```sql
-- Increase for the current session
SET work_mem = '64MB';

-- Check the effect on a sort
EXPLAIN (ANALYZE) SELECT * FROM big_table ORDER BY value;
```

## Observing Sort Methods

The best way to understand sort behavior is to try different `work_mem` settings:

```sql
-- Force in-memory sort (generous work_mem)
SET work_mem = '256MB';
EXPLAIN (ANALYZE) SELECT * FROM big_table ORDER BY value;
-- Sort Method: quicksort  Memory: 12345kB

-- Force disk sort (tiny work_mem)
SET work_mem = '64kB';
EXPLAIN (ANALYZE) SELECT * FROM big_table ORDER BY value;
-- Sort Method: external merge  Disk: 54321kB

-- Top-N heapsort with LIMIT
EXPLAIN (ANALYZE) SELECT * FROM big_table ORDER BY value LIMIT 10;
-- Sort Method: top-N heapsort  Memory: 25kB
```

## Performance Impact

The difference between in-memory and disk sort can be dramatic:

- **In-memory quicksort**: Microseconds to milliseconds
- **External merge sort**: Milliseconds to seconds (or more), depending on data size and disk speed
- **Top-N heapsort**: Microseconds, regardless of table size

When you see "external merge Disk" in your EXPLAIN output, it means the sort spilled to disk. Options:
1. Increase `work_mem` (if you have memory headroom)
2. Add an index that provides pre-sorted data (eliminates the sort entirely)
3. Restructure the query to sort less data

## Indexes as Pre-Sorted Data

An index on the `ORDER BY` column can eliminate the sort entirely:

```sql
CREATE INDEX idx_orders_date ON orders(created_at);

-- No sort needed — the index provides data in order
EXPLAIN SELECT * FROM orders ORDER BY created_at LIMIT 100;
-- Index Scan using idx_orders_date (no Sort node)
```

The planner weighs the cost of sorting against the cost of using an index. For large result sets, sorting might still be cheaper than the random I/O of an index scan.

## Key Takeaways

- PostgreSQL uses quicksort (in-memory), external merge sort (disk), or top-N heapsort (LIMIT) depending on data size and work_mem
- `work_mem` controls the per-operation memory budget for sorts
- External merge sort in EXPLAIN means the sort spilled to disk — a performance warning
- Top-N heapsort is extremely efficient for `ORDER BY ... LIMIT N` queries
- Indexes can eliminate sorts entirely by providing pre-ordered data

Next, we'll look at hash operations — the other major building block of query execution.
