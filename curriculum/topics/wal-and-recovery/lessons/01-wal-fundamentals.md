---
title: WAL Fundamentals
description: Understand Write-Ahead Logging — how PostgreSQL ensures data durability by writing changes to a log before modifying data files
estimatedMinutes: 40
---

# WAL Fundamentals

Write-Ahead Logging (WAL) is PostgreSQL's mechanism for ensuring data durability. The core principle is simple: **before modifying any data file, write a description of the change to a log**. If the system crashes, the log can replay changes to restore the database to a consistent state.

## The WAL Principle

When you UPDATE a row, PostgreSQL doesn't immediately write the new data to the table's heap file on disk. Instead:

1. **Write the change to WAL** (the log file)
2. **Modify the page in shared buffers** (in-memory cache)
3. **Eventually flush the dirty page to disk** (background writer or checkpoint)

If the system crashes between steps 2 and 3, the WAL contains enough information to redo the change. This is the "write-ahead" guarantee — the log is always ahead of the data files.

## Why WAL? (Steal/No-Force)

PostgreSQL uses a **steal/no-force** buffer management policy:

- **Steal**: Dirty pages can be written to disk before a transaction commits (to make room in the buffer pool)
- **No-Force**: Dirty pages don't have to be written to disk at commit time

This is optimal for performance — commits are fast (just flush the WAL) and the buffer pool is flexible. WAL makes this possible because:
- If a dirty page is stolen before commit and the transaction aborts, WAL has undo information
- If a committed transaction's pages aren't yet on disk and we crash, WAL has redo information

## WAL Segments and LSN

WAL is organized into **segments** — fixed-size files (default 16MB each) stored in `pg_wal/`:

```sql
-- Current WAL write position (Log Sequence Number)
SELECT pg_current_wal_lsn();
```

The **LSN** (Log Sequence Number) is a position in the WAL stream. It's a monotonically increasing 64-bit value formatted as `offset/segment_offset` (e.g., `0/1A3B4C0`).

Every change to a data page is identified by an LSN. Each page header stores the LSN of the last WAL record that modified it. This is how PostgreSQL knows whether a page needs recovery — compare the page's LSN with the WAL.

## WAL Configuration

```sql
-- Current WAL level (determines what information is recorded)
SHOW wal_level;  -- minimal, replica, or logical
```

| Level | Records | Use Case |
|-------|---------|----------|
| minimal | Minimum for crash recovery | Standalone, no replication |
| replica | Enough for physical replication | Streaming replication (default) |
| logical | Adds logical decoding info | Logical replication, CDC |

Higher levels record more information, generating more WAL data.

## Monitoring WAL

The `pg_stat_wal` view (PostgreSQL 14+) provides WAL statistics:

```sql
SELECT * FROM pg_stat_wal;
```

Key columns:
- **wal_records**: Total number of WAL records generated
- **wal_bytes**: Total WAL data generated in bytes
- **wal_buffers_full**: Number of times WAL buffers were full (indicates write pressure)
- **wal_write**: Number of times WAL data was written to disk
- **wal_sync**: Number of times WAL data was synced to disk (fsync)

## WAL Generation Rate

You can observe how much WAL your operations generate:

```sql
-- Record current position
SELECT pg_current_wal_lsn() AS before;

-- Do some work
INSERT INTO my_table SELECT generate_series(1, 10000);

-- Check new position
SELECT pg_current_wal_lsn() AS after;

-- Calculate WAL generated (in bytes)
SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/1A3B4C0'::pg_lsn) AS wal_bytes;
```

Bulk inserts, updates, and index creation are heavy WAL generators. Understanding WAL generation helps you predict replication lag and plan storage for WAL archives.

## ARIES and Recovery Theory

PostgreSQL's WAL implementation is based on the **ARIES** (Algorithms for Recovery and Isolation Exploiting Semantics) protocol from database theory. The recovery process has three phases:

1. **Analysis**: Scan the WAL from the last checkpoint to determine which transactions were active and which pages need recovery
2. **Redo**: Replay all WAL records forward to bring pages up to date (even for aborted transactions)
3. **Undo**: Roll back any transactions that were active at crash time

In practice, PostgreSQL simplifies this — it uses full-page images (FPI) after each checkpoint to avoid the need for undo in most cases.

## Key Takeaways

- WAL ensures durability: changes are logged before data files are modified
- If the system crashes, WAL replay restores the database to a consistent state
- LSN (Log Sequence Number) tracks position in the WAL stream
- `pg_current_wal_lsn()` shows the current write position
- `wal_level` controls how much information is recorded (minimal → replica → logical)
- `pg_stat_wal` provides statistics on WAL generation
- PostgreSQL's recovery is based on the ARIES protocol: analysis → redo → undo

Next, we'll look at checkpoints — how PostgreSQL periodically ensures data files are up to date with the WAL.
