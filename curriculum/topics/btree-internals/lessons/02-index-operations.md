---
title: Index Operations
description: Understand how indexes are built, maintained, and the performance cost of index maintenance
estimatedMinutes: 35
---

# Index Operations

Indexes accelerate reads but slow down writes. Every INSERT, UPDATE, or DELETE on a table must also update every index on that table. Understanding this tradeoff is essential for making good indexing decisions.

## How Inserts Work in a B+ Tree

When you INSERT a row, PostgreSQL must:
1. Insert the tuple into the heap (table)
2. For each index on the table, find the correct leaf page and insert a new entry

Finding the correct leaf page is fast (3-4 page reads down the tree). But if the leaf page is full, it must **split**: the page divides into two, and the parent internal node gets a new entry pointing to the new page. Splits can cascade up the tree, though this is rare due to the high fanout.

## Bulk Loading vs Individual Inserts

Creating an index on a pre-populated table is much faster than inserting rows one at a time into an indexed table:

**Individual inserts** (INSERT with existing index): Each row requires navigating the tree, finding the right leaf, and potentially splitting pages. With N rows, that's O(N × log_f N) page accesses.

**Bulk loading** (CREATE INDEX after populating): PostgreSQL sorts all the key values first, then builds the tree bottom-up — creating full leaf pages in order, then building internal nodes on top. This is O(N) I/O operations with sequential writes.

```sql
-- Fast: populate first, then create index
INSERT INTO my_table SELECT ... FROM generate_series(1, 1000000);
CREATE INDEX idx_my_table_value ON my_table(value);

-- Slower: index exists during inserts
CREATE INDEX idx_my_table_value ON my_table(value);
INSERT INTO my_table SELECT ... FROM generate_series(1, 1000000);
```

This is why `CREATE INDEX` on a large existing table can be surprisingly fast — it uses a sort-based bulk loading algorithm rather than individual tree insertions.

## Index Maintenance Cost

Every index on a table adds overhead to write operations:

```sql
-- Table with no indexes: only heap write
-- Table with 1 index: heap write + 1 index update
-- Table with 5 indexes: heap write + 5 index updates
```

The cost is roughly linear in the number of indexes. For write-heavy tables, having too many indexes can significantly slow down INSERT/UPDATE/DELETE operations.

You can observe this directly:

```sql
-- Compare INSERT speed with different index counts
EXPLAIN ANALYZE INSERT INTO test_table SELECT generate_series(1, 1000);
-- Then add indexes and repeat to see the difference
```

## Index Size vs Table Size

Indexes have their own storage overhead. For a simple integer index, each entry is about 16 bytes (8 bytes for the key + 8 bytes for the heap TID), plus page overhead. For a text column, entries can be much larger.

```sql
SELECT
  pg_size_pretty(pg_relation_size('my_table')) AS table_size,
  pg_size_pretty(pg_relation_size('idx_my_table_col')) AS index_size,
  pg_size_pretty(pg_total_relation_size('my_table')) AS total_size;
```

It's not uncommon for total index size to exceed the table data size, especially for tables with many indexes or indexes on wide columns.

## Index Bloat

Just like tables, indexes accumulate dead entries from UPDATEs and DELETEs. VACUUM removes dead index entries, but the freed space remains within the index file (just like table bloat).

```sql
-- Check index bloat with pgstattuple
SELECT * FROM pgstatindex('my_index_name');
```

Key fields:
- **leaf_fragmentation**: Percentage of leaf pages that are not in physical order
- **avg_leaf_density**: Average percentage of leaf page space used (lower = more bloat)
- **empty_pages**: Pages with no live entries (reclaimable)

Severely bloated indexes can be rebuilt:

```sql
-- Rebuild an index (blocks writes briefly)
REINDEX INDEX my_index_name;

-- Or concurrently (no blocking, but slower)
REINDEX INDEX CONCURRENTLY my_index_name;
```

## Key Takeaways

- Every write operation must update all indexes on the table — more indexes means slower writes
- Bulk loading (CREATE INDEX after INSERT) is much faster than individual indexed inserts
- Index size depends on key width and row count; total indexes can exceed table size
- Indexes suffer from bloat just like tables; use `pgstatindex()` to measure
- REINDEX rebuilds a bloated index; CONCURRENTLY avoids blocking writes

Next, we'll explore how the physical ordering of table data relative to an index — clustering — affects query performance dramatically.
