---
title: "MVCC and Tuple Visibility"
description: "Understand how PostgreSQL's Multi-Version Concurrency Control creates and manages tuple versions, and how xmin/xmax control visibility"
estimatedMinutes: 45
---

# MVCC and Tuple Visibility

Every time you UPDATE a row in PostgreSQL, the database does not modify the existing row in place. Instead, it creates an entirely new copy of the row and marks the old one as obsolete. This is the foundation of PostgreSQL's **Multi-Version Concurrency Control (MVCC)** system, and understanding it is essential for understanding why VACUUM exists.

## Why MVCC Matters

Traditional databases use locking to control concurrent access: a writer locks the row, and readers wait. PostgreSQL takes a different approach — **readers never block writers, and writers never block readers**. It achieves this by keeping multiple versions of each row (tuple) simultaneously in the heap.

When you UPDATE a row:

1. The old tuple remains in the page, untouched
2. A new tuple is written (possibly to a different page)
3. The old tuple is marked with the transaction ID of the updating transaction
4. Concurrent transactions can still see the old version if their snapshot predates the update

This means PostgreSQL accumulates dead tuples over time — old row versions that no active transaction needs to see anymore. VACUUM is the process that cleans them up.

## Tuple Headers: xmin and xmax

Every tuple in PostgreSQL has a header containing two critical fields:

- **xmin**: The transaction ID (XID) that *created* this tuple version (via INSERT or UPDATE)
- **xmax**: The transaction ID that *deleted* or *updated* this tuple version (0 if the tuple is still live)

You can inspect these directly:

```sql
CREATE TABLE employees (id SERIAL PRIMARY KEY, name TEXT, salary INTEGER);
INSERT INTO employees (name, salary) VALUES ('Alice', 75000);

SELECT xmin, xmax, * FROM employees;
```

```
 xmin | xmax | id | name  | salary
------+------+----+-------+--------
  742 |    0 |  1 | Alice |  75000
```

Here, `xmin = 742` means transaction 742 created this tuple. `xmax = 0` means no transaction has deleted or updated it — the tuple is live.

## What Happens During an UPDATE

When you update a row, PostgreSQL performs these steps:

1. Finds the current tuple
2. Sets `xmax` on the current tuple to the current transaction ID
3. Inserts a new tuple with `xmin` set to the current transaction ID and `xmax = 0`
4. Updates any indexes pointing to the old tuple (unless HOT update applies)

```sql
UPDATE employees SET salary = 80000 WHERE name = 'Alice';

SELECT xmin, xmax, * FROM employees;
```

```
 xmin | xmax | id | name  | salary
------+------+----+-------+--------
  743 |    0 |  1 | Alice |  80000
```

You see only one row because your transaction can only see the *current* version. But on disk, **both tuples exist** in the heap. The old tuple (salary = 75000) still has `xmin = 742` and now has `xmax = 743`. The new tuple has `xmin = 743` and `xmax = 0`.

## What Happens During a DELETE

A DELETE does not physically remove the tuple. It simply sets `xmax` on the tuple to the deleting transaction's ID:

```sql
DELETE FROM employees WHERE name = 'Alice';
```

After this, the tuple still exists on disk with `xmax` set. It is a **dead tuple** — invisible to all new transactions but still consuming space.

## Visibility Rules

PostgreSQL uses `xmin` and `xmax` along with the transaction's **snapshot** to determine which tuples are visible. The simplified rules are:

1. A tuple is **visible** if:
   - `xmin` is a committed transaction that started before the current snapshot
   - AND `xmax` is either 0 (not deleted), or points to a transaction that is not yet committed or started after the current snapshot

2. A tuple is **invisible** if:
   - `xmin` is an aborted transaction, OR
   - `xmin` is a transaction that started after the current snapshot, OR
   - `xmax` is a committed transaction that started before the current snapshot

This is how MVCC provides snapshot isolation — each transaction sees a consistent view of the database as of its start time, regardless of concurrent modifications.

## The Hint Bits Optimization

Checking whether a transaction is committed requires looking up the **CLOG** (commit log, stored in `pg_xact/`). This is expensive if done for every tuple on every read. PostgreSQL optimizes this with **hint bits** stored in the tuple header's `t_infomask` field:

- `HEAP_XMIN_COMMITTED` (0x0100): The inserting transaction committed
- `HEAP_XMIN_INVALID` (0x0200): The inserting transaction aborted
- `HEAP_XMAX_COMMITTED` (0x0400): The deleting/updating transaction committed
- `HEAP_XMAX_INVALID` (0x0800): The deleting/updating transaction aborted

The first transaction to read a tuple after the inserting transaction ends will set these hint bits. This means **reads can cause writes** in PostgreSQL — the reader updates the hint bits on the page, which eventually needs to be flushed to disk. This is one reason why the first read after a bulk load can be slower than subsequent reads.

## Inspecting Tuples with pageinspect

The `pageinspect` extension lets you examine raw tuple data on a page, including the full header information:

```sql
CREATE EXTENSION IF NOT EXISTS pageinspect;

-- See all tuples on page 0 of the table, including dead ones
SELECT
  t_xmin,
  t_xmax,
  t_ctid,
  t_infomask,
  t_data
FROM heap_page_items(get_raw_page('employees', 0));
```

```
 t_xmin | t_xmax | t_ctid | t_infomask | t_data
--------+--------+--------+------------+--------
    742 |    743 | (0,2)  |       9218 | ...
    743 |      0 | (0,2)  |      10498 | ...
```

This reveals what a normal SELECT hides: both the old and new tuple versions. The `t_ctid` (Current Tuple ID) on the old tuple points to `(0,2)` — the location of the new version. This forms a **version chain** that PostgreSQL follows during updates.

### Understanding t_infomask

The `t_infomask` is a bitmask. You can decode it:

```sql
SELECT
  t_xmin,
  t_xmax,
  t_ctid,
  CASE WHEN (t_infomask & 256) > 0 THEN 'XMIN_COMMITTED' ELSE '' END AS xmin_status,
  CASE WHEN (t_infomask & 1024) > 0 THEN 'XMAX_COMMITTED' ELSE '' END AS xmax_status,
  CASE WHEN (t_infomask & 2048) > 0 THEN 'XMAX_INVALID' ELSE '' END AS xmax_invalid
FROM heap_page_items(get_raw_page('employees', 0));
```

This tells you whether PostgreSQL has confirmed the inserting and deleting transactions' commit status.

## The CTID: Physical Tuple Location

Every tuple has a `ctid` (Current Tuple ID) that represents its physical location as `(page_number, tuple_index)`:

```sql
SELECT ctid, * FROM employees;
```

```
 ctid  | id | name  | salary
-------+----+-------+--------
 (0,2) |  1 | Alice |  80000
```

The tuple is on page 0, at position 2. Position 1 is occupied by the dead tuple (the pre-update version) — it is still on the page but invisible to normal queries.

When PostgreSQL updates a row, the old tuple's `ctid` is updated to point to the new tuple's location. This creates the version chain:

```
Old tuple at (0,1): ctid = (0,2)  →  New tuple at (0,2): ctid = (0,2)
```

The new (current) tuple always has its `ctid` pointing to itself.

## HOT Updates: A Key Optimization

When an UPDATE does not change any indexed column and the new tuple fits on the same page, PostgreSQL can perform a **Heap-Only Tuple (HOT)** update:

1. The new tuple is placed on the same page
2. No index entries need updating
3. The old tuple's line pointer is redirected to the new tuple

HOT updates are significantly cheaper than regular updates because they avoid index maintenance. You can check how many HOT updates a table gets:

```sql
SELECT
  n_tup_upd,
  n_tup_hot_upd,
  CASE WHEN n_tup_upd > 0
    THEN round(100.0 * n_tup_hot_upd / n_tup_upd, 1)
    ELSE 0
  END AS hot_update_pct
FROM pg_stat_user_tables
WHERE relname = 'employees';
```

A low HOT update percentage on a heavily-updated table suggests that either the updates are changing indexed columns or the pages are too full for the new tuple (consider increasing `fillfactor`).

## Dead Tuples: The Cost of MVCC

Every UPDATE and DELETE creates dead tuples. These dead tuples:

- **Consume disk space**: They occupy room on the page that could be used for new rows
- **Slow down sequential scans**: The database must read and skip dead tuples
- **Waste buffer pool memory**: Dead tuples are loaded into shared buffers alongside live ones
- **Increase index size**: Index entries pointing to dead tuples persist until VACUUM

On a table with heavy UPDATE traffic, dead tuples can outnumber live tuples:

```sql
SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  CASE WHEN n_live_tup > 0
    THEN round(100.0 * n_dead_tup / n_live_tup, 1)
    ELSE 0
  END AS dead_pct
FROM pg_stat_user_tables
WHERE relname = 'employees';
```

This is exactly why VACUUM exists: to reclaim the space occupied by dead tuples that no transaction needs to see anymore.

## The Visibility Map

PostgreSQL maintains a **visibility map** for each table — a bitmap with two bits per page:

- **All-visible bit**: Set when all tuples on the page are visible to all current transactions
- **All-frozen bit**: Set when all tuples on the page have been frozen (their xmin is permanently marked as committed)

The visibility map has two major uses:

1. **Index-only scans**: If a page is marked all-visible, PostgreSQL can skip fetching the heap page during an index-only scan — the answer is guaranteed to be visible
2. **VACUUM optimization**: VACUUM can skip all-visible pages since there are no dead tuples to clean

```sql
-- Check visibility map coverage
SELECT
  relname,
  relallvisible,
  relpages,
  CASE WHEN relpages > 0
    THEN round(100.0 * relallvisible / relpages, 1)
    ELSE 0
  END AS visible_pct
FROM pg_class
WHERE relname = 'employees';
```

A low `visible_pct` after VACUUM runs suggests the table has heavy concurrent modification traffic.

## Key Takeaways

- PostgreSQL never modifies tuples in place — UPDATE creates a new version, DELETE marks the old one
- `xmin` and `xmax` in the tuple header control which transactions can see which tuple version
- Dead tuples (old versions) accumulate over time and waste space, I/O, and memory
- The `pageinspect` extension reveals the raw tuple state including dead versions
- HOT updates avoid index maintenance when the updated columns are not indexed
- The visibility map tracks which pages have only visible tuples, enabling index-only scans and faster VACUUM
- VACUUM is the process that reclaims dead tuple space — the subject of the following lessons
