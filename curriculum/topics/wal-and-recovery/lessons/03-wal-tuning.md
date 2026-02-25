---
title: WAL Tuning
description: Learn about synchronous_commit tradeoffs, full_page_writes, and WAL generation optimization
estimatedMinutes: 30
---

# WAL Tuning

WAL configuration involves trade-offs between durability, performance, and storage. Understanding these trade-offs helps you make informed decisions for your workload.

## synchronous_commit

By default, PostgreSQL waits for WAL records to be flushed to disk before confirming a COMMIT. `synchronous_commit` controls this behavior:

```sql
SHOW synchronous_commit;  -- Default: on
```

| Setting | Behavior | Durability | Performance |
|---------|----------|-----------|-------------|
| on | Wait for WAL flush to local disk | Full | Baseline |
| off | Don't wait for WAL flush | Small window of data loss on crash | Faster commits |
| remote_write | Wait for WAL write to standby OS cache | Good | Moderate |
| remote_apply | Wait for WAL apply on standby | Best | Slowest |

### synchronous_commit = off

```sql
SET synchronous_commit = off;
INSERT INTO events SELECT generate_series(1, 10000);
-- Commits return faster — no waiting for fsync
```

With `synchronous_commit = off`, commits return as soon as the WAL record is in the WAL buffer (memory), without waiting for it to be flushed to disk. If the system crashes in the brief window before the next flush (typically < 10ms), those committed transactions may be lost.

**When to use**: Logging tables, analytics events, or any data where losing the last fraction of a second is acceptable. The database remains consistent (no corruption) — you just might lose a few recent commits.

**Important**: This is not the same as disabling WAL. The data is still logged — just not synchronously flushed. The risk window is tiny (a few milliseconds between WAL buffer writes).

## full_page_writes

After each checkpoint, the first modification to any page writes the entire 8KB page to WAL (a "full page image" or FPI):

```sql
SHOW full_page_writes;  -- Default: on
```

**Why?** If a crash occurs mid-write (a "torn page"), only part of the 8KB page might have been written to the data file. The full page image in WAL provides a known-good copy to restore from.

**Cost**: FPI increases WAL volume significantly, especially right after a checkpoint when every modified page generates a full 8KB WAL record.

**When to turn off**: Only if your filesystem guarantees atomic 8KB writes (some do with specific configurations). Most systems should leave this on.

## WAL Generation Optimization

Reducing WAL volume improves performance and reduces replication lag:

### 1. Batch Operations
```sql
-- Generates less WAL per row than individual INSERTs
INSERT INTO events SELECT ... FROM generate_series(1, 10000);

-- vs
-- INSERT INTO events VALUES (...);  -- repeated 10000 times
```

### 2. Unlogged Tables
```sql
CREATE UNLOGGED TABLE temp_data (...);
```
Unlogged tables skip WAL entirely — faster writes but data is lost on crash. Good for temporary/derived data.

### 3. COPY vs INSERT
```sql
-- COPY generates compact WAL records
COPY events FROM '/path/to/data.csv';
```

### 4. Index Management
Creating indexes on bulk-loaded data generates less WAL than indexing during inserts:
```sql
-- Drop indexes, bulk load, recreate
DROP INDEX idx_events_date;
COPY events FROM '/path/to/data.csv';
CREATE INDEX idx_events_date ON events(created_at);
```

## max_wal_size and min_wal_size

```sql
SHOW max_wal_size;  -- Default: 1GB
SHOW min_wal_size;  -- Default: 80MB
```

- `max_wal_size`: Triggers checkpoint when WAL volume reaches this size
- `min_wal_size`: Minimum WAL to retain even after recycling

For write-heavy workloads, increase `max_wal_size` to reduce checkpoint frequency.

## Key Takeaways

- `synchronous_commit = off` trades a tiny durability window for faster commits
- `full_page_writes` protects against torn pages by writing full 8KB images to WAL after each checkpoint
- Bulk operations, COPY, and unlogged tables reduce WAL volume
- `max_wal_size` controls checkpoint frequency — higher values mean fewer checkpoints but more WAL storage
- WAL tuning is about trade-offs: durability vs performance vs storage

Next, we'll look at WAL's role in the broader context — replication, Point-in-Time Recovery, and cloud-managed databases.
