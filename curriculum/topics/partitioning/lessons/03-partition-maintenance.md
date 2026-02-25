---
title: Partition Maintenance
description: Learn to attach, detach, and manage partitions for data lifecycle management
estimatedMinutes: 30
---

# Partition Maintenance

One of the biggest advantages of partitioning is operational — you can add, remove, and manage individual partitions without affecting the entire table. This enables efficient data lifecycle management: archive old data, add capacity for new data, and maintain indexes per-partition.

## Adding New Partitions

As time passes, you need to create new partitions for incoming data:

```sql
-- Add a new monthly partition
CREATE TABLE events_2025_04 PARTITION OF events
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
```

**Automate this**: In production, set up a cron job or scheduled task to create partitions ahead of time. If a partition doesn't exist when data arrives and there's no default partition, the INSERT will fail.

## ATTACH PARTITION

You can create a regular table and attach it as a partition:

```sql
-- Create a standalone table
CREATE TABLE events_2025_05 (LIKE events INCLUDING ALL);

-- Populate it (e.g., from a data migration)
INSERT INTO events_2025_05 SELECT ... ;

-- Attach it as a partition
ALTER TABLE events
    ATTACH PARTITION events_2025_05
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
```

When attaching, PostgreSQL validates that all existing rows in the table satisfy the partition constraint. For large tables, this scan can take time. To skip validation (if you're certain the data is correct):

```sql
-- Add a matching CHECK constraint first
ALTER TABLE events_2025_05
    ADD CONSTRAINT check_range CHECK (
        created_at >= '2025-05-01' AND created_at < '2025-06-01'
    );

-- Now ATTACH skips validation (the CHECK already guarantees correctness)
ALTER TABLE events
    ATTACH PARTITION events_2025_05
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
```

## DETACH PARTITION

Detaching removes a partition from the table without deleting its data:

```sql
-- Standard detach (brief lock on parent)
ALTER TABLE events DETACH PARTITION events_2024_01;

-- Concurrent detach (minimal locking, PostgreSQL 14+)
ALTER TABLE events DETACH PARTITION events_2024_01 CONCURRENTLY;
```

After detaching, `events_2024_01` becomes a standalone table. You can:
- Archive it (dump to cold storage)
- Drop it (`DROP TABLE events_2024_01`)
- Query it independently for historical analysis
- Move it to a different tablespace

This is much faster than DELETE — detach is instant, while deleting millions of rows generates massive WAL and dead tuples.

## Index Inheritance

When you create an index on a partitioned table, PostgreSQL automatically creates matching indexes on all existing partitions and any future partitions:

```sql
-- Create index on parent
CREATE INDEX idx_events_type ON events(event_type);

-- Check that partitions got indexes too
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename LIKE 'events_%'
ORDER BY tablename, indexname;
```

Each partition gets its own independent index. These per-partition indexes are smaller and faster to maintain than a single index on a huge table.

You can also create indexes on individual partitions:
```sql
-- Index only on the current month's partition
CREATE INDEX idx_events_current_data ON events_2025_03(data)
    USING gin;
```

## Partition Maintenance Patterns

### Rolling Window
Keep the last N months of data partitioned, archive older:

```sql
-- Monthly cron job:
-- 1. Create next month's partition
CREATE TABLE events_2025_06 PARTITION OF events
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

-- 2. Detach partition older than retention period
ALTER TABLE events DETACH PARTITION events_2024_06;

-- 3. Archive or drop
-- pg_dump events_2024_06 > /archive/events_2024_06.sql
DROP TABLE events_2024_06;
```

### Bulk Data Loading
Load data into a standalone table, add indexes, then attach:

```sql
-- 1. Create table with same schema
CREATE TABLE events_import (LIKE events INCLUDING ALL);

-- 2. Bulk load (no partition overhead)
COPY events_import FROM '/data/events.csv';

-- 3. Create indexes
CREATE INDEX ON events_import(event_type);

-- 4. Add constraint for fast attach
ALTER TABLE events_import ADD CONSTRAINT check_range
    CHECK (created_at >= '2025-05-01' AND created_at < '2025-06-01');

-- 5. Attach (skips validation due to CHECK)
ALTER TABLE events ATTACH PARTITION events_import
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
```

### Per-Partition VACUUM
VACUUM can target individual partitions:

```sql
VACUUM (VERBOSE) events_2025_03;
```

This is faster than vacuuming the entire partitioned table and lets you prioritize active partitions.

## Key Takeaways

- Create new partitions ahead of time to avoid INSERT failures
- ATTACH PARTITION adds a table as a partition; add a CHECK constraint first to skip validation
- DETACH PARTITION removes a partition without deleting data — instant vs slow DELETE
- Indexes on the parent table are automatically inherited by all partitions
- Rolling window pattern: create new, detach old, archive/drop
- Per-partition VACUUM and REINDEX for targeted maintenance
- DETACH CONCURRENTLY (PG 14+) minimizes locking

This completes our exploration of table partitioning. You now understand the three partitioning strategies, how partition pruning optimizes queries, and how to manage partitions for data lifecycle operations.
