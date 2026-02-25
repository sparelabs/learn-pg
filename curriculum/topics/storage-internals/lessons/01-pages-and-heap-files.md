---
title: Pages and Heap Files
description: Learn how PostgreSQL organizes data into 8KB pages and heap files, and why this matters for performance
estimatedMinutes: 40
---

# Pages and Heap Files

Every time you run a query, PostgreSQL doesn't read individual rows from disk — it reads **pages**. Understanding this fundamental I/O unit is the key to understanding why some queries are fast and others are slow.

## The 8KB Page: PostgreSQL's Fundamental I/O Unit

PostgreSQL stores all data in fixed-size blocks called **pages** (also called **blocks**). Every page is exactly 8KB (8192 bytes) by default:

```sql
SHOW block_size;
```

```
 block_size
------------
 8192
```

This is a compile-time constant — you cannot change it without recompiling PostgreSQL. Every read from disk, every write to disk, and every buffer in shared memory operates in units of 8KB pages.

**Why fixed-size pages?** Fixed sizes make memory management simple and predictable. The buffer pool is just an array of 8KB slots. No fragmentation, no variable-size allocation headaches.

## Page Layout

Each 8KB page has a specific internal structure:

```
+-------------------+
| Page Header       |  (24 bytes)
+-------------------+
| Item Pointers     |  (4 bytes each, grow downward)
| (line pointers)   |
+-------------------+
| Free Space        |
|                   |
+-------------------+
| Tuples (rows)     |  (grow upward from bottom)
+-------------------+
| Special Space     |  (index-specific, 0 for heap)
+-------------------+
```

- **Page Header**: Contains metadata like the page's LSN (Log Sequence Number), checksum, and pointers to free space boundaries
- **Item Pointers**: An array of 4-byte entries, each pointing to a tuple's offset and length within the page. They grow from the top down
- **Free Space**: The gap between item pointers and tuples
- **Tuples**: The actual row data, stored from the bottom of the page upward
- **Special Space**: Used by index pages (B-tree, GiST, etc.); zero bytes for regular heap pages

The item pointer indirection is important — it means we can move tuples around within a page without updating external references. The item pointer's offset just gets updated.

## Heap Files: Unordered Collections of Pages

A PostgreSQL table is stored as a **heap file** — simply a sequence of pages with no particular ordering:

```sql
-- See where a table's data file lives on disk
SELECT pg_relation_filepath('pg_class');
```

The heap is "unordered" because rows are inserted wherever there's free space. Unlike a clustered index in some other databases, PostgreSQL doesn't maintain any row ordering by default.

This has important consequences:
- **Inserts are fast**: Just find a page with free space and add the tuple
- **Sequential scans read every page**: There's no way to skip pages based on row values
- **Updates create new tuple versions**: The old tuple stays in place (MVCC), and a new version goes wherever there's space

## Why PostgreSQL Reads Pages, Not Rows

When you ask for a single row, PostgreSQL must still read the entire 8KB page containing that row. If your row is 100 bytes, you're reading 8192 bytes to get 100 bytes of useful data.

This is why **row width matters**. Narrower rows mean more rows fit per page, which means fewer pages to read:

```sql
-- Create a table and see how many pages it uses
CREATE TABLE narrow_rows (id INTEGER, flag BOOLEAN);
INSERT INTO narrow_rows SELECT i, true FROM generate_series(1, 10000) i;
ANALYZE narrow_rows;

SELECT
  pg_relation_size('narrow_rows') AS total_bytes,
  pg_relation_size('narrow_rows') / 8192 AS pages
;
```

Each tuple has a header of about 23 bytes plus alignment padding, so even a tiny row takes ~32 bytes minimum. A single 8KB page can hold roughly 226 minimal rows (8192 / 36 bytes including alignment).

## Measuring Table Size

PostgreSQL provides several functions to inspect storage:

```sql
-- Raw table data size (heap only)
SELECT pg_relation_size('my_table');

-- Human-readable format
SELECT pg_size_pretty(pg_relation_size('my_table'));

-- Total size including indexes and TOAST
SELECT pg_size_pretty(pg_total_relation_size('my_table'));

-- Calculate number of pages
SELECT pg_relation_size('my_table') / 8192 AS pages;
```

The difference between `pg_relation_size` and `pg_total_relation_size` can be surprising — indexes and TOAST data often exceed the heap size.

## Sequential I/O vs Random I/O

When the planner chooses between a Sequential Scan and an Index Scan, it's fundamentally choosing between two I/O patterns:

**Sequential Scan**: Reads pages in order (page 0, 1, 2, 3...). The operating system can predict this pattern and pre-fetch upcoming pages. On HDDs, the disk head moves smoothly. On SSDs, sequential reads still benefit from OS readahead and larger I/O requests.

**Index Scan**: Reads pages in whatever order the index dictates, which is often scattered across the heap. Each page fetch is a separate random I/O operation.

This is why PostgreSQL sometimes chooses a Sequential Scan even when an index exists — if the query needs to read a large fraction of the table, sequential I/O reading every page is faster than random I/O jumping around.

```sql
-- The planner weighs these costs
SHOW seq_page_cost;     -- Default: 1.0
SHOW random_page_cost;  -- Default: 4.0
```

The default `random_page_cost` of 4.0 tells the planner that a random page read is 4x more expensive than a sequential one. On SSDs, you might lower this to 1.1-1.5, since random reads are much cheaper on flash storage.

### Cloud Context

In cloud environments with fast NVMe SSDs or network-attached storage, the gap between sequential and random I/O is narrower but doesn't disappear entirely. Network storage (like AWS EBS) adds latency that affects random reads more than sequential reads due to request overhead. Always benchmark your specific setup rather than assuming defaults are correct.

## Key Takeaways

- PostgreSQL reads and writes data in 8KB pages — never individual rows
- Tables are stored as heap files: unordered sequences of pages
- Each page has a header, item pointers, free space, and tuples
- Narrower rows = more rows per page = fewer I/O operations
- Sequential I/O (reading pages in order) is faster than random I/O (jumping between pages)
- Use `pg_relation_size()` and `pg_total_relation_size()` to understand your table's physical footprint

In the next lesson, we'll look at what happens when values are too large to fit in a regular page — the TOAST system.
