---
title: "Long Transaction Impact on VACUUM"
description: "Understand how long-running and idle-in-transaction sessions prevent VACUUM from cleaning dead tuples, and learn strategies to prevent this"
estimatedMinutes: 40
---

# Long Transaction Impact on VACUUM

VACUUM can only remove dead tuples that **no active transaction** might need to see. A single long-running transaction can hold back VACUUM across the entire database, causing dead tuples to pile up indefinitely. This is one of the most common — and most damaging — operational issues in PostgreSQL.

## The VACUUM Horizon

PostgreSQL maintains a global **VACUUM horizon** (also called the `xmin horizon` or `oldestXmin`). This is the oldest transaction ID that any active transaction might still need to read.

VACUUM cannot remove any tuple with `xmax` newer than this horizon, because some active transaction might still need to see that tuple's old version.

```
Timeline:
  XID 1000 ──── XID 1500 ──── XID 2000 ──── XID 2500 (current)

  If a transaction started at XID 1000 is still open:
    VACUUM horizon = 1000
    Dead tuples with xmax > 1000 CANNOT be removed
    Dead tuples with xmax ≤ 1000 CAN be removed
```

Even if only one transaction is open at XID 1000, and millions of tuples were deleted between XID 1001 and 2500, VACUUM cannot clean any of them.

## Demonstrating the Problem

### Step 1: Open a Long Transaction

In Session A:

```sql
BEGIN;
SELECT 1;  -- Transaction is now open, holding a snapshot
```

### Step 2: Generate Dead Tuples

In Session B:

```sql
CREATE TABLE vacuum_test (id SERIAL, data TEXT);
INSERT INTO vacuum_test (data) SELECT repeat('x', 100) FROM generate_series(1, 10000);

-- Update all rows, creating 10K dead tuples
UPDATE vacuum_test SET data = repeat('y', 100);
```

### Step 3: Try to VACUUM

In Session B:

```sql
VACUUM VERBOSE vacuum_test;
```

Output:
```
INFO:  vacuuming "public.vacuum_test"
INFO:  table "vacuum_test": found 0 removable, 10000 nonremovable row versions in 145 out of 290 pages
DETAIL:  10000 dead row versions cannot be removed yet.
```

Zero dead tuples removed! VACUUM sees 10,000 dead tuples but reports "10000 dead row versions cannot be removed yet." This is because Session A's open transaction prevents cleanup.

### Step 4: End the Long Transaction

In Session A:

```sql
COMMIT;
```

### Step 5: VACUUM Again

In Session B:

```sql
VACUUM VERBOSE vacuum_test;
```

Output:
```
INFO:  vacuuming "public.vacuum_test"
INFO:  table "vacuum_test": found 10000 removable, 10000 nonremovable row versions in 290 out of 290 pages
```

Now all 10,000 dead tuples are removed.

## Identifying Long Transactions

### Check pg_stat_activity

```sql
SELECT
  pid,
  usename,
  application_name,
  state,
  backend_start,
  xact_start,
  query_start,
  now() - xact_start AS transaction_duration,
  now() - query_start AS query_duration,
  left(query, 80) AS current_query
FROM pg_stat_activity
WHERE state != 'idle'
  AND xact_start IS NOT NULL
ORDER BY xact_start ASC;
```

Key columns:
- **xact_start**: When the current transaction began — old values are dangerous
- **state**: Look for `idle in transaction` — the worst offender
- **transaction_duration**: How long the transaction has been open

### The "Idle in Transaction" Problem

The most common source of VACUUM-blocking long transactions is `idle in transaction` — a session that started a transaction with `BEGIN` but has not issued a `COMMIT` or `ROLLBACK`:

```sql
SELECT
  pid,
  usename,
  state,
  now() - xact_start AS idle_duration,
  left(query, 80) AS last_query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY xact_start ASC;
```

Common causes:
- Application code that opens a transaction but does not close it before doing other work (HTTP calls, file I/O)
- Connection pool connections returned to the pool while still in a transaction
- Interactive sessions where the developer forgot to COMMIT
- ORM frameworks that open transactions eagerly

## The Cascading Effect

A single idle-in-transaction session can cause:

1. **Dead tuples accumulate** across ALL tables (the VACUUM horizon is global)
2. **Table bloat grows** as dead tuples consume space that VACUUM cannot reclaim
3. **Queries slow down** as sequential scans must skip increasing numbers of dead tuples
4. **Index bloat grows** as index entries pointing to dead tuples persist
5. **XID age increases** because VACUUM cannot freeze tuples newer than the horizon
6. **Disk usage increases** as bloat accumulates
7. **Autovacuum workers spin** — they run, find nothing removable, and give up

This can turn a single forgotten `COMMIT` into a multi-hour database degradation event.

## Prevention Strategies

### 1. idle_in_transaction_session_timeout

PostgreSQL 9.6+ can automatically terminate sessions that stay idle in a transaction:

```sql
-- Terminate sessions idle in transaction for more than 5 minutes
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';
SELECT pg_reload_conf();

-- Check current setting
SHOW idle_in_transaction_session_timeout;
```

When triggered, the session receives an error and the transaction is aborted. The application should handle this gracefully (e.g., retry the transaction).

### 2. statement_timeout

Prevents any single query from running indefinitely:

```sql
-- Global setting
ALTER SYSTEM SET statement_timeout = '30s';
SELECT pg_reload_conf();

-- Per-session (useful for different workloads)
SET statement_timeout = '5min';  -- For batch jobs
```

Note: `statement_timeout` does NOT abort idle-in-transaction sessions — it only affects actively running statements. Use `idle_in_transaction_session_timeout` for idle sessions.

### 3. Connection Pooler Configuration

Connection poolers like PGDog and PgBouncer can detect and handle idle-in-transaction connections:

- **PGDog**: Configurable `idle_in_transaction_timeout` that returns the connection to the pool
- **PgBouncer**: `server_idle_timeout` and `query_wait_timeout` settings

When using transaction-mode pooling, the connection is returned to the pool after each transaction completes. If a client fails to complete a transaction, the pooler can enforce a timeout.

### 4. Application-Level Patterns

```python
# BAD: Transaction stays open during HTTP call
cursor.execute("BEGIN")
cursor.execute("SELECT ...")
response = http_client.get("https://external-api.com/slow")  # 30 seconds!
cursor.execute("UPDATE ...")
cursor.execute("COMMIT")

# GOOD: Minimize transaction scope
response = http_client.get("https://external-api.com/slow")
cursor.execute("BEGIN")
cursor.execute("SELECT ...")
cursor.execute("UPDATE ...")
cursor.execute("COMMIT")
```

The golden rule: **keep transactions as short as possible**. Do all external I/O (HTTP calls, file reads, message queue operations) outside of transaction boundaries.

## Monitoring Queries

### Find the VACUUM Horizon Holder

```sql
-- Who is holding back the VACUUM horizon?
SELECT
  pid,
  usename,
  application_name,
  state,
  backend_xmin,
  now() - xact_start AS txn_age,
  left(query, 80) AS query
FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC
LIMIT 5;
```

The `backend_xmin` column shows the oldest XID each session is holding. The oldest one sets the VACUUM horizon.

### Check Dead Tuple Accumulation Rate

```sql
-- Snapshot at time T
SELECT relname, n_dead_tup, now() AS check_time
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

-- Compare with a later snapshot to see accumulation rate
```

If `n_dead_tup` keeps growing and `last_autovacuum` is recent (VACUUM is running but not cleaning), a long transaction is likely the cause.

### Automated Alert Query

```sql
-- Alert if any transaction is open > 10 minutes
SELECT
  count(*) AS long_txn_count,
  min(now() - xact_start) AS shortest_duration,
  max(now() - xact_start) AS longest_duration
FROM pg_stat_activity
WHERE state IN ('idle in transaction', 'active')
  AND xact_start < now() - interval '10 minutes';
```

## Replication Slots and the Horizon

Replication slots also affect the VACUUM horizon. An inactive or lagging replication slot holds back the global `xmin`, preventing VACUUM from cleaning tuples:

```sql
SELECT
  slot_name,
  slot_type,
  active,
  age(xmin) AS slot_xmin_age,
  age(catalog_xmin) AS slot_catalog_xmin_age
FROM pg_replication_slots
ORDER BY age(xmin) DESC NULLS LAST;
```

Stale replication slots are a common cause of VACUUM problems. If a slot is no longer needed, drop it:

```sql
SELECT pg_drop_replication_slot('stale_slot_name');
```

PostgreSQL 13+ provides `max_slot_wal_keep_size` to limit how much WAL a slot can hold, but it does not address the VACUUM horizon issue.

## Recovery: When Dead Tuples Have Already Accumulated

If you discover a long transaction has been blocking VACUUM:

1. **Terminate the offending session**:
```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - xact_start > interval '1 hour';
```

2. **Run manual VACUUM on affected tables**:
```sql
-- Identify most-affected tables
SELECT relname, n_dead_tup
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;

-- VACUUM each one
VACUUM VERBOSE affected_table;
```

3. **Monitor recovery**:
```sql
SELECT relname, n_dead_tup, last_vacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC;
```

4. **Implement prevention** (timeouts, monitoring) to avoid recurrence.

## Key Takeaways

- A single long transaction can prevent VACUUM from cleaning dead tuples across all tables
- The VACUUM horizon is set by the oldest active transaction's snapshot
- `idle in transaction` sessions are the most common offender
- Set `idle_in_transaction_session_timeout` to automatically terminate idle sessions
- Monitor `pg_stat_activity.xact_start` and `backend_xmin` to find horizon holders
- Replication slots also hold back the VACUUM horizon
- Keep transactions short — do external I/O outside transaction boundaries
- After resolving a long transaction, manually VACUUM the most-affected tables
