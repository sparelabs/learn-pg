---
title: Practical Index Patterns
description: Master multi-column indexes, partial indexes, expression indexes, and choosing the right index type
estimatedMinutes: 40
---

# Practical Index Patterns

Knowing how B+ trees work internally helps you design better indexes. This lesson covers the most important practical patterns: multi-column index ordering, partial indexes, expression indexes, and when to choose different index types.

## Multi-Column Index Ordering

A multi-column index `(a, b, c)` sorts entries first by `a`, then by `b` within each `a` value, then by `c` within each `(a, b)` pair. This has important implications for which queries can use the index.

**The leftmost prefix rule**: The index can efficiently serve queries that filter on a prefix of the key columns:

```sql
CREATE INDEX idx_users_city_name ON users(city, name);

-- Uses the index (filters on first column)
SELECT * FROM users WHERE city = 'Boston';

-- Uses the index (filters on both columns)
SELECT * FROM users WHERE city = 'Boston' AND name = 'Alice';

-- Cannot use the index efficiently (skips first column)
SELECT * FROM users WHERE name = 'Alice';
```

The last query can't efficiently use the index because you'd need to scan every `city` group to find all `name = 'Alice'` entries — essentially a full index scan.

**Column ordering matters**: Put the most selective (highest cardinality) equality filter first, then range filters:

```sql
-- Good: equality on status (few values), then range on created_at
CREATE INDEX idx_orders ON orders(status, created_at);

-- Serves this query well:
SELECT * FROM orders WHERE status = 'pending' AND created_at > '2024-01-01';
```

## Partial Indexes

A partial index only includes rows matching a WHERE condition:

```sql
CREATE INDEX idx_active_orders ON orders(id, customer_id)
WHERE status = 'active';
```

Benefits:
- **Smaller**: Only indexes rows that match the condition
- **Faster to maintain**: Inserts/updates of non-matching rows don't touch this index
- **More specific**: The planner knows the index only contains matching rows

Use cases:
- Filtering on a status column where you only query one status
- Indexing non-null values in a sparse column
- Soft-delete patterns: `WHERE deleted_at IS NULL`

```sql
-- Only index non-deleted records
CREATE INDEX idx_users_email ON users(email)
WHERE deleted_at IS NULL;
```

The planner uses a partial index when your query's WHERE clause implies the index's predicate.

## Expression Indexes

An expression index indexes the result of a function or expression:

```sql
-- Index on lowercased email for case-insensitive lookups
CREATE INDEX idx_users_lower_email ON users(lower(email));

-- This query can use the index:
SELECT * FROM users WHERE lower(email) = 'user@example.com';
```

Common expression index patterns:
- `lower()` or `upper()` for case-insensitive text search
- Date extraction: `date_trunc('month', created_at)` for monthly grouping
- JSONB fields: `((metadata->>'type'))` for indexing specific JSON keys
- Type casts: `(text_column::integer)` when you frequently filter on a cast

```sql
-- Index a JSONB field
CREATE INDEX idx_events_type ON events((data->>'event_type'));
```

## Choosing Index Types

PostgreSQL offers several index types beyond B-tree:

### B-tree (Default)
- Best for: equality and range queries (`=`, `<`, `>`, `BETWEEN`, `ORDER BY`)
- Supports: multi-column, partial, covering (INCLUDE), unique
- Use when: you're not sure — B-tree is the right choice 90% of the time

### Hash
- Best for: equality-only queries (`=`)
- Smaller than B-tree for large keys
- Cannot support range queries or ordering
- Use when: you only need equality lookups on a wide column

```sql
CREATE INDEX idx_sessions_token ON sessions USING hash(token);
```

### GIN (Generalized Inverted Index)
- Best for: containment queries on arrays, JSONB, full-text search
- Stores a posting list of TIDs for each key value
- Use when: querying JSONB with `@>`, arrays with `&&`/`@>`, or tsvector full-text search

```sql
CREATE INDEX idx_docs_tags ON documents USING gin(tags);
-- Supports: SELECT * FROM documents WHERE tags @> ARRAY['urgent'];
```

### BRIN (Block Range Index)
- Best for: naturally ordered, append-only data (like timestamps in a time-series table)
- Extremely small: stores min/max per block range (default 128 pages)
- Use when: data is physically ordered by the indexed column and the table is large

```sql
CREATE INDEX idx_logs_timestamp ON logs USING brin(created_at);
```

### GiST (Generalized Search Tree)
- Best for: geometric data, range types, nearest-neighbor searches
- Supports: `&&` (overlap), `@>` (contains), `<->` (distance)
- Use when: working with PostGIS geometry or range types

## Choosing Wisely

Before creating an index, ask:
1. **What queries will it serve?** Match the index type and columns to your actual query patterns
2. **What's the write overhead?** Each index slows down writes
3. **Is it worth the space?** Check if `pg_relation_size` of the index is justified by query improvement
4. **Could a partial index be smaller?** If you always filter on a specific condition, make it partial
5. **Does an existing index already cover it?** An index on `(a, b)` serves queries on `a` alone

## Key Takeaways

- Multi-column indexes serve queries that filter on a leftmost prefix of the key columns
- Column ordering matters: put equality filters first, range filters last
- Partial indexes are smaller and faster when you only query a subset of rows
- Expression indexes enable efficient lookups on function results like `lower(email)`
- B-tree is the right choice for most cases; GIN for JSONB/arrays, BRIN for time-series, Hash for equality-only
- Always consider the write overhead and space cost before adding an index

This completes our deep dive into B+ tree internals and index patterns. You now understand how indexes are structured, how they affect write performance, how clustering impacts reads, and how to design indexes that match your query patterns.
