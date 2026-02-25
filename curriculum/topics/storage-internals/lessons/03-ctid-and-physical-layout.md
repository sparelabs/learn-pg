---
title: CTIDs and Physical Layout
description: Understand how PostgreSQL addresses tuples using CTIDs and explore physical tuple layout with pageinspect
estimatedMinutes: 40
---

# CTIDs and Physical Layout

Every tuple (row version) in PostgreSQL has a physical address called a **CTID** — a (page number, tuple offset) pair. Understanding CTIDs reveals how PostgreSQL finds data, how updates work, and why MVCC creates "new" rows instead of modifying existing ones.

## CTID: The Physical Tuple Address

A CTID (Current Tuple ID) is a pair of numbers `(page, offset)` that uniquely identifies a tuple's physical location:

```sql
SELECT ctid, * FROM pg_class LIMIT 5;
```

```
  ctid  | oid  | relname        | ...
--------+------+----------------+----
 (0,1)  | 2619 | pg_statistic   | ...
 (0,2)  | 1247 | pg_type        | ...
 (0,3)  | 2604 | pg_attrdef     | ...
 (0,4)  | 2602 | pg_amop        | ...
 (0,5)  | 2615 | pg_namespace   | ...
```

- `(0,1)` means page 0, item pointer 1
- The item pointer on page 0 points to the actual tuple data within that page

CTIDs are **not stable identifiers**. They change when:
- A row is updated (the new version gets a new CTID)
- `VACUUM FULL` or `CLUSTER` reorganizes the table
- A regular `VACUUM` frees space that later gets reused

**Never use CTIDs as row identifiers in application code.** They're for understanding physical layout, not for referencing rows.

## How UPDATE Changes CTIDs

When you update a row in PostgreSQL, the original tuple is not modified in place. Instead, MVCC creates a new tuple version:

```sql
CREATE TABLE ctid_demo (id INTEGER PRIMARY KEY, value TEXT);
INSERT INTO ctid_demo VALUES (1, 'original');

-- Check the CTID
SELECT ctid, * FROM ctid_demo WHERE id = 1;
-- Result: (0,1) | 1 | original

-- Update the row
UPDATE ctid_demo SET value = 'updated' WHERE id = 1;

-- Check the CTID again
SELECT ctid, * FROM ctid_demo WHERE id = 1;
-- Result: (0,2) | 1 | updated
```

The CTID changed from `(0,1)` to `(0,2)`. The old tuple at `(0,1)` is now a **dead tuple** — invisible to new transactions but still physically present until VACUUM removes it.

This is MVCC in action: the old version remains readable by any transaction that started before the update, while new transactions see the updated version.

## HOT Updates

There's an important optimization called **HOT** (Heap-Only Tuple) updates. When an update:
1. Doesn't change any indexed column
2. The new tuple fits on the same page as the old tuple

PostgreSQL can chain the old and new tuples together on the same page without updating any indexes. The old tuple's `t_ctid` field points to the new tuple, creating an in-page chain.

HOT updates are a significant optimization because they avoid the expensive index update step. You can monitor HOT update effectiveness:

```sql
SELECT
  relname,
  n_tup_upd AS total_updates,
  n_tup_hot_upd AS hot_updates,
  CASE WHEN n_tup_upd > 0
    THEN round(100.0 * n_tup_hot_upd / n_tup_upd, 1)
    ELSE 0
  END AS hot_pct
FROM pg_stat_user_tables
WHERE n_tup_upd > 0
ORDER BY n_tup_upd DESC;
```

If your HOT update percentage is low, it usually means your updates touch indexed columns, or pages are too full to fit new tuple versions (consider a lower `fillfactor`).

## Inside a Page with pageinspect

The `pageinspect` extension lets you examine the raw contents of a page:

```sql
-- See all tuples on page 0 of a table
SELECT * FROM heap_page_items(get_raw_page('ctid_demo', 0));
```

This returns one row per tuple on the page, showing:

| Column | Meaning |
|--------|---------|
| `lp` | Line pointer number (the offset part of CTID) |
| `lp_off` | Byte offset of tuple within the page |
| `lp_len` | Tuple length in bytes |
| `t_xmin` | Transaction ID that created this tuple |
| `t_xmax` | Transaction ID that deleted/updated this tuple (0 if live) |
| `t_ctid` | This tuple's CTID (or the next version's CTID for updated tuples) |
| `t_infomask` | Status bits (committed, aborted, etc.) |
| `t_data` | Raw tuple data (hex-encoded) |

## Tuple Header Fields

Each tuple has a 23-byte header with critical MVCC information:

### t_xmin and t_xmax
- **t_xmin**: The transaction that inserted this tuple. The tuple is visible to transactions with IDs >= t_xmin (if that transaction committed)
- **t_xmax**: The transaction that deleted or updated this tuple. If 0, the tuple hasn't been deleted/updated. If non-zero, the tuple is invisible to transactions with IDs >= t_xmax (if that transaction committed)

```sql
-- See the MVCC fields
SELECT t_xmin, t_xmax, t_ctid
FROM heap_page_items(get_raw_page('ctid_demo', 0));
```

After an UPDATE, you'll see:
- The old tuple: `t_xmax` is set to the updating transaction's ID, and `t_ctid` points to the new tuple
- The new tuple: `t_xmin` is the updating transaction's ID, `t_xmax` is 0

### t_infomask
A bitmask that stores tuple state flags:
- `HEAP_XMIN_COMMITTED`: The inserting transaction has committed
- `HEAP_XMAX_INVALID`: The t_xmax value is invalid (tuple is live)
- `HEAP_UPDATED`: This tuple was created by an UPDATE
- `HEAP_HOT_UPDATED`: This tuple has been HOT updated

These bits are set lazily — they may not be set immediately when a transaction commits, but get set the next time the tuple is accessed (a process called "hint bit setting").

## Practical Uses of CTID Knowledge

### Deduplication
CTIDs can identify duplicate physical rows for cleanup:

```sql
-- Find and count duplicates by physical location
DELETE FROM my_table a
USING my_table b
WHERE a.ctid < b.ctid
  AND a.key_column = b.key_column;
```

### Understanding EXPLAIN Output
When you see "Tid Scan" in EXPLAIN output, it means PostgreSQL is fetching a specific tuple by its CTID — the fastest possible single-row lookup.

### Diagnosing Bloat
Gaps in CTID sequences indicate dead tuple space. If page 0 has items 1-100 but page 5 has items 1-10, the early pages may have significant dead space.

## Key Takeaways

- Every tuple has a CTID `(page, offset)` — its physical address within the heap
- UPDATEs create new tuple versions with new CTIDs; old tuples become dead
- HOT updates keep new versions on the same page, avoiding index updates
- The `pageinspect` extension reveals raw page contents: `t_xmin`, `t_xmax`, `t_ctid`
- Tuple headers contain MVCC visibility information that controls which transactions see which rows
- CTIDs are unstable — never use them as persistent row identifiers

Next, we'll explore what happens to all those dead tuples from updates and deletes — table bloat and how to measure it.
