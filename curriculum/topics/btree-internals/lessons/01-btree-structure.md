---
title: B+ Tree Structure
description: Understand the anatomy of B+ tree indexes — leaf nodes, internal nodes, fanout, and why 3-4 levels handle billions of rows
estimatedMinutes: 45
---

# B+ Tree Structure

The B+ tree is PostgreSQL's default index type and the workhorse behind most query acceleration. Understanding its structure helps you predict when indexes help, when they don't, and why some queries need only 3-4 I/O operations to find a row among billions.

## B+ Tree Anatomy

A B+ tree is a balanced tree structure with two types of nodes:

**Internal nodes** contain keys and pointers to child nodes. They act as a directory — guiding the search toward the right leaf.

**Leaf nodes** contain keys and pointers to heap tuples (the actual table rows). All leaf nodes are at the same depth, and they're linked together in a doubly-linked list for efficient range scans.

```
         [Internal: 50, 100]
        /        |          \
  [Leaf: 10,20,30,40] → [Leaf: 50,60,70,80] → [Leaf: 100,110,120]
       ↓↓↓↓                   ↓↓↓↓                    ↓↓↓↓
    (heap TIDs)            (heap TIDs)              (heap TIDs)
```

Key properties:
- **Balanced**: Every path from root to leaf has the same length
- **Sorted**: Keys within each node are in order
- **Linked leaves**: Leaf nodes form a chain, enabling efficient range scans
- **High fanout**: Each node can hold many keys (hundreds), keeping the tree shallow

## Fanout and Tree Height

**Fanout** is the number of children each internal node can have. PostgreSQL's 8KB pages can hold hundreds of index entries, giving a fanout of roughly 200-500 depending on key size.

With a fanout of 300:
- Level 0 (root): 1 node → up to 300 children
- Level 1: 300 nodes → up to 90,000 children
- Level 2: 90,000 leaf nodes → up to 27,000,000 entries
- Level 3: 27,000,000 × 300 = 8.1 billion entries

**Three to four levels is enough for virtually any table.** This means finding any row requires at most 3-4 page reads — even in a table with billions of rows.

The search time is **O(log_f N)** where f is the fanout and N is the number of entries. With f=300 and N=1 billion: log_300(1,000,000,000) ≈ 3.6 — about 4 page reads.

## Examining B+ Tree Metadata with pageinspect

The `pageinspect` extension provides functions to examine B+ tree internals:

### bt_metap: Index Metadata

```sql
SELECT * FROM bt_metap('my_index_name');
```

Returns:
- **magic**: B-tree magic number (verification)
- **version**: B-tree version
- **root**: Page number of the root node
- **level**: Height of the tree (0 = root is a leaf)
- **fastroot**: Page number of the fast root (optimization)
- **fastlevel**: Level of the fast root

### bt_page_stats: Page-Level Statistics

```sql
SELECT * FROM bt_page_stats('my_index_name', 1);
```

Returns statistics for a specific page:
- **blkno**: Block number
- **type**: 'l' for leaf, 'i' for internal, 'r' for root
- **live_items**: Number of live index entries
- **dead_items**: Number of dead entries
- **avg_item_size**: Average entry size
- **free_size**: Free space remaining

### bt_page_items: Individual Entries

```sql
SELECT * FROM bt_page_items('my_index_name', 1) LIMIT 10;
```

Shows each index entry on a page:
- **itemoffset**: Position within the page
- **ctid**: Heap TID this entry points to
- **data**: The indexed key value (hex-encoded)

## Index Size and Pages

You can calculate how many pages an index occupies:

```sql
-- Index size in bytes
SELECT pg_relation_size('my_index_name');

-- Index size in pages
SELECT pg_relation_size('my_index_name') / 8192 AS index_pages;

-- Compare to table size
SELECT
  pg_size_pretty(pg_relation_size('my_table')) AS table_size,
  pg_size_pretty(pg_relation_size('my_index_name')) AS index_size;
```

Index size depends on:
- **Number of rows**: More rows = more leaf entries
- **Key width**: Wider keys = fewer entries per page = more pages
- **Fill factor**: Default 90% for B-tree leaves (10% free space for updates)

## Why Understanding B+ Trees Matters

1. **Predicting index effectiveness**: An index lookup is ~3-4 random page reads. If your query returns thousands of rows, those thousands of heap fetches may be slower than a sequential scan
2. **Index sizing**: You can estimate index size before creating it
3. **Key ordering**: The leftmost columns of a multi-column index form the search prefix — understanding the tree structure explains why
4. **Range scans**: The linked leaf list is why `BETWEEN` queries are efficient with an index

## Key Takeaways

- B+ trees have internal nodes (directory) and leaf nodes (data pointers), all at the same depth
- High fanout (200-500) means 3-4 levels handle billions of rows
- Each level requires one page read, so index lookups are O(log_f N) I/O operations
- `pageinspect` functions (`bt_metap`, `bt_page_stats`, `bt_page_items`) reveal internal structure
- Index size grows with row count and key width

Next, we'll look at how indexes are built and maintained, and the cost of keeping them updated.
