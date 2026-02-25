---
title: Partitioning Basics
description: Learn declarative partitioning syntax, range/hash/list strategies, and when to partition
estimatedMinutes: 40
---

# Partitioning Basics

Table partitioning splits a large table into smaller physical pieces (partitions) while presenting a single logical table to queries. PostgreSQL supports declarative partitioning with three strategies: range, hash, and list.

## Why Partition?

Partitioning helps when tables get very large (typically 100M+ rows or 100+ GB):

1. **Query performance**: Partition pruning lets queries skip irrelevant partitions entirely
2. **Maintenance**: VACUUM, REINDEX, and backups can operate on individual partitions
3. **Data lifecycle**: Old partitions can be detached and archived without touching active data
4. **Parallel operations**: Different partitions can be scanned in parallel

**When NOT to partition**: Small tables, tables without a clear partitioning key, or when indexes alone solve your query performance needs. Partitioning adds complexity.

## Declarative Partitioning Syntax

PostgreSQL 10+ supports declarative partitioning:

```sql
-- Create a partitioned table (no data storage — just a template)
CREATE TABLE events (
    id BIGSERIAL,
    created_at TIMESTAMPTZ NOT NULL,
    event_type TEXT NOT NULL,
    data JSONB
) PARTITION BY RANGE (created_at);
```

The parent table stores no data — it's a routing layer. Data lives in the partitions.

## Range Partitioning

Range partitioning divides data by value ranges. Most commonly used with timestamps:

```sql
-- Monthly partitions
CREATE TABLE events_2025_01 PARTITION OF events
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE events_2025_02 PARTITION OF events
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE events_2025_03 PARTITION OF events
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
```

The range is **inclusive of FROM** and **exclusive of TO** — a value of `2025-02-01 00:00:00` goes into the February partition, not January.

**Best for**: Time-series data, date-based archiving, sequential ID ranges.

## Hash Partitioning

Hash partitioning distributes data evenly across partitions using a hash function:

```sql
CREATE TABLE users (
    id BIGSERIAL,
    name TEXT NOT NULL,
    email TEXT NOT NULL
) PARTITION BY HASH (id);

CREATE TABLE users_p0 PARTITION OF users
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE users_p1 PARTITION OF users
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE users_p2 PARTITION OF users
    FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE users_p3 PARTITION OF users
    FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

Hash partitioning ensures even data distribution regardless of value distribution. Each row is assigned to a partition based on `hash(id) % modulus`.

**Best for**: Even distribution for parallel queries, sharding preparation.

## List Partitioning

List partitioning assigns specific values to specific partitions:

```sql
CREATE TABLE orders (
    id BIGSERIAL,
    region TEXT NOT NULL,
    total NUMERIC(10,2)
) PARTITION BY LIST (region);

CREATE TABLE orders_us PARTITION OF orders
    FOR VALUES IN ('us-east', 'us-west');
CREATE TABLE orders_eu PARTITION OF orders
    FOR VALUES IN ('eu-west', 'eu-central');
CREATE TABLE orders_apac PARTITION OF orders
    FOR VALUES IN ('ap-southeast', 'ap-northeast');
```

**Best for**: Categorical data (region, status, tenant), multi-tenant applications.

## Default Partition

A default partition catches rows that don't match any other partition:

```sql
CREATE TABLE events_default PARTITION OF events DEFAULT;
```

Without a default partition, inserting a row that doesn't match any partition raises an error. With a default, unmatched rows go to the default partition.

**Tip**: Always create a default partition to prevent insert failures. Periodically check it — rows landing there might indicate missing partitions.

## Partition Key Selection

The partition key should be:
- **Present in most queries**: Enables partition pruning
- **Part of the WHERE clause**: Queries filtering on the key benefit most
- **Included in unique constraints**: Unique indexes must include the partition key

```sql
-- Unique constraint must include the partition key
CREATE TABLE events (
    id BIGSERIAL,
    created_at TIMESTAMPTZ NOT NULL,
    event_type TEXT NOT NULL,
    UNIQUE (id, created_at)  -- Must include created_at (partition key)
) PARTITION BY RANGE (created_at);
```

This constraint is why some applications add the partition key to their primary key.

## Key Takeaways

- Partitioning splits large tables into smaller physical pieces for better performance and manageability
- Three strategies: range (time-series), hash (even distribution), list (categorical)
- The parent table stores no data — partitions hold the actual rows
- Range partitions use `FROM ... TO` (inclusive/exclusive)
- Default partitions catch rows that don't match any defined partition
- Unique constraints must include the partition key
- Don't partition small tables — the complexity isn't worth it

Next, we'll see how the query planner uses partition pruning to skip irrelevant partitions.
