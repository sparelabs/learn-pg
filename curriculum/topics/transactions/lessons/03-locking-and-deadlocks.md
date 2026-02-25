---
title: Locking and Deadlocks
description: Understand PostgreSQL's lock types, the pg_locks view, and how deadlocks are detected and resolved
estimatedMinutes: 40
---

# Locking and Deadlocks

While MVCC allows reads without locks, writes do require locks. PostgreSQL has a sophisticated locking system with multiple lock modes, a waits-for graph for deadlock detection, and a configurable timeout for resolving deadlocks.

## Row-Level Locks

Row locks are acquired by DML statements and `SELECT ... FOR`:

| Lock Mode | Acquired By | Conflicts With |
|-----------|------------|---------------|
| FOR KEY SHARE | Foreign key checks | FOR UPDATE |
| FOR SHARE | SELECT ... FOR SHARE | FOR UPDATE, FOR NO KEY UPDATE |
| FOR NO KEY UPDATE | UPDATE (non-key columns) | FOR SHARE, FOR UPDATE, FOR NO KEY UPDATE |
| FOR UPDATE | UPDATE/DELETE, SELECT ... FOR UPDATE | All other row locks |

```sql
-- Lock a row for update
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;

-- Shared lock (multiple readers allowed)
SELECT * FROM accounts WHERE id = 1 FOR SHARE;

-- Non-blocking attempt
SELECT * FROM accounts WHERE id = 1 FOR UPDATE NOWAIT;
-- Raises ERROR if the row is already locked

-- Skip locked rows
SELECT * FROM accounts WHERE id = 1 FOR UPDATE SKIP LOCKED;
-- Returns nothing if the row is locked (useful for job queues)
```

## Table-Level Locks

Table locks are acquired automatically by DDL and DML:

| Lock Mode | Acquired By |
|-----------|------------|
| ACCESS SHARE | SELECT |
| ROW SHARE | SELECT ... FOR UPDATE/SHARE |
| ROW EXCLUSIVE | INSERT, UPDATE, DELETE |
| SHARE UPDATE EXCLUSIVE | VACUUM, ANALYZE, CREATE INDEX CONCURRENTLY |
| SHARE | CREATE INDEX (non-concurrent) |
| SHARE ROW EXCLUSIVE | CREATE TRIGGER |
| EXCLUSIVE | REFRESH MATERIALIZED VIEW CONCURRENTLY |
| ACCESS EXCLUSIVE | ALTER TABLE, DROP TABLE, VACUUM FULL |

The key insight: regular SELECTs (ACCESS SHARE) conflict only with ACCESS EXCLUSIVE. This means DDL operations like ALTER TABLE block all queries, but otherwise reads and writes coexist freely at the table level.

## Monitoring Locks with pg_locks

The `pg_locks` view shows all current locks in the system:

```sql
SELECT
  l.locktype,
  l.relation::regclass,
  l.mode,
  l.granted,
  l.pid,
  a.query
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation IS NOT NULL
ORDER BY l.relation;
```

Key columns:
- **locktype**: `relation` (table), `transactionid`, `tuple`, `advisory`
- **mode**: The lock mode (e.g., `RowExclusiveLock`, `AccessShareLock`)
- **granted**: `true` if acquired, `false` if waiting
- **pid**: Process ID of the lock holder/waiter

To find blocking relationships:

```sql
SELECT
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocker.pid AS blocker_pid,
  blocker.query AS blocker_query
FROM pg_stat_activity blocked
JOIN pg_locks blocked_locks ON blocked.pid = blocked_locks.pid
JOIN pg_locks blocker_locks ON blocked_locks.relation = blocker_locks.relation
  AND blocked_locks.pid != blocker_locks.pid
JOIN pg_stat_activity blocker ON blocker_locks.pid = blocker.pid
WHERE NOT blocked_locks.granted;
```

## Deadlocks

A deadlock occurs when two (or more) transactions are each waiting for a lock held by the other. Neither can proceed.

```sql
-- Session A                          -- Session B
BEGIN;                                BEGIN;
UPDATE accounts SET balance = 100
WHERE id = 1;  -- Locks row 1
                                      UPDATE accounts SET balance = 200
                                      WHERE id = 2;  -- Locks row 2
UPDATE accounts SET balance = 100
WHERE id = 2;  -- Waits for row 2
                                      UPDATE accounts SET balance = 200
                                      WHERE id = 1;  -- Waits for row 1
-- DEADLOCK!
```

### Deadlock Detection

PostgreSQL runs a deadlock detector after `deadlock_timeout` (default: 1 second). When it detects a cycle in the waits-for graph, it:

1. Chooses a victim transaction (the one that would be least expensive to abort)
2. Aborts the victim with `ERROR: deadlock detected`
3. The other transaction can proceed

```sql
SHOW deadlock_timeout;  -- Default: 1s
```

### Preventing Deadlocks

1. **Consistent lock ordering**: Always lock resources in the same order across all transactions
2. **Lock escalation**: Lock at a coarser granularity (e.g., table level) when fine-grained locking is complex
3. **Short transactions**: Minimize the time locks are held
4. **NOWAIT or SKIP LOCKED**: Don't wait for locks you might not get

```sql
-- Consistent ordering: always lock lower ID first
BEGIN;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
SELECT * FROM accounts WHERE id = 2 FOR UPDATE;
-- Process both accounts
COMMIT;
```

## Lock Wait Monitoring

```sql
-- Find waiting queries
SELECT pid, query, wait_event_type, wait_event, state
FROM pg_stat_activity
WHERE wait_event_type = 'Lock';
```

## Key Takeaways

- PostgreSQL has row-level locks (FOR UPDATE/SHARE) and table-level locks (acquired automatically by DML/DDL)
- MVCC means reads don't block writes, but writes can block other writes
- `pg_locks` shows all current locks; join with `pg_stat_activity` for query details
- Deadlocks are detected automatically after `deadlock_timeout` (default 1s)
- Prevent deadlocks through consistent lock ordering, short transactions, and NOWAIT/SKIP LOCKED
- `FOR UPDATE SKIP LOCKED` is the pattern for job queues and work distribution

Next, we'll explore advisory locks — application-controlled locks for coordination beyond row and table locking.
