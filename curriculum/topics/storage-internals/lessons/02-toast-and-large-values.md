---
title: TOAST and Large Values
description: Understand how PostgreSQL handles values too large to fit in a single page using the TOAST system
estimatedMinutes: 35
---

# TOAST and Large Values

A PostgreSQL page is 8KB. But what happens when you store a 1MB JSON document or a 100KB text field? The answer is **TOAST** — The Oversized-Attribute Storage Technique.

## The TOAST Threshold

PostgreSQL requires that every row fits within a single page (roughly 8KB). When a column value is large enough that the row would exceed about 2KB, PostgreSQL automatically moves that value out-of-line into a separate **TOAST table**.

The threshold is approximately 2KB per column value (technically, it's about 1/4 of a page). This is not a hard limit you configure — it's an internal mechanism that happens transparently.

## TOAST Strategies

Each column has a TOAST strategy that controls how large values are handled:

| Strategy | Compression | Out-of-line Storage | Default For |
|----------|------------|-------------------|-------------|
| **PLAIN** | No | No | Fixed-width types (integer, boolean) |
| **EXTENDED** | Yes, then out-of-line | Yes | Variable-width types (text, jsonb) |
| **EXTERNAL** | No | Yes | When you want fast access without decompression |
| **MAIN** | Yes, keep in-line | Only as last resort | Large fixed-width arrays |

**EXTENDED** (the default for text/jsonb) first tries to compress the value. If it's still too large after compression, it moves the value to the TOAST table. This gives you the best of both worlds — small values stay inline (fast access), large values get compressed and stored separately.

**EXTERNAL** skips compression and goes straight to out-of-line storage. This is useful when you want fast substring access on large text values (decompression requires reading the entire value, but EXTERNAL lets you read chunks).

```sql
-- Change a column's TOAST strategy
ALTER TABLE documents ALTER COLUMN body SET STORAGE EXTERNAL;
```

## TOAST Tables

Every toastable table has a companion TOAST table. You can find it:

```sql
-- Find the TOAST table for a regular table
SELECT relname, reltoastrelid::regclass
FROM pg_class
WHERE relname = 'my_table';
```

TOAST tables live in a special `pg_toast` schema and have names like `pg_toast.pg_toast_12345`. They store chunked values — large values are split into chunks (typically ~2000 bytes each) and stored across multiple rows in the TOAST table.

## Observing TOAST with pg_column_size

The `pg_column_size()` function shows how much space a value actually takes, including compression:

```sql
CREATE TABLE toast_demo (
  id SERIAL PRIMARY KEY,
  short_text TEXT,
  long_text TEXT
);

INSERT INTO toast_demo (short_text, long_text)
VALUES (
  'hello',
  repeat('x', 10000)
);

-- Compare stored sizes
SELECT
  pg_column_size(short_text) AS short_size,
  pg_column_size(long_text) AS long_size
FROM toast_demo;
```

The `long_text` column will show a compressed size much smaller than 10,000 bytes. If the value compresses well, `pg_column_size` may show just a few hundred bytes for a value that's thousands of characters when decompressed.

## Performance Implications

TOAST is largely transparent, but it has real performance impacts:

### Detoasting Overhead
When you `SELECT` a TOASTed column, PostgreSQL must:
1. Read the main table row (finds a TOAST pointer instead of the actual value)
2. Read from the TOAST table (potentially multiple chunks)
3. Reassemble the chunks
4. Decompress if using EXTENDED strategy

This is why `SELECT *` on tables with large text/jsonb columns can be slow — you're detoasting columns you may not even need.

### Projections Help
Only requested columns get detoasted:

```sql
-- Fast: doesn't touch the large_document column
SELECT id, status FROM documents;

-- Slow: must detoast large_document for every row
SELECT * FROM documents;
```

### TOAST and Index Only Scans
Covering indexes (`INCLUDE`) can avoid touching the heap entirely, but TOASTed values cannot be included in indexes. The index stores a pointer, not the actual value.

### Compression Ratio Varies
Highly repetitive text (like JSON with repeated keys) compresses extremely well. Random binary data barely compresses at all. The TOAST system uses pglz compression by default (PostgreSQL 14+ also supports LZ4 with `ALTER TABLE ... SET (toast_compression = lz4)`).

## When to Think About TOAST

Most of the time, TOAST just works and you don't need to worry about it. But consider it when:

- **Query performance is slow on text/jsonb columns**: Check if detoasting is the bottleneck. Use `EXPLAIN (ANALYZE, BUFFERS)` to see buffer reads — TOAST table reads show up separately
- **Storage is higher than expected**: TOASTed values are chunked, and each chunk has overhead. Plus the TOAST table has its own indexes
- **You need fast substring access**: Switch to EXTERNAL storage to avoid decompression overhead for partial reads

## Key Takeaways

- TOAST handles values too large for a single page (~2KB threshold per column)
- Four strategies: PLAIN (no TOAST), EXTENDED (compress + out-of-line), EXTERNAL (out-of-line only), MAIN (compress, avoid out-of-line)
- `pg_column_size()` shows actual stored size including compression
- Detoasting has a performance cost — avoid `SELECT *` on tables with large columns
- TOAST is transparent but understanding it helps diagnose storage and performance issues

Next, we'll look at CTIDs — the physical addresses PostgreSQL uses to locate tuples within pages.
