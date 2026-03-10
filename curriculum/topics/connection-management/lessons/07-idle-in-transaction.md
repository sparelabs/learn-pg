---
title: "Idle in Transaction: The Silent Connection Killer"
description: Understand why idle-in-transaction sessions are dangerous, how they pin connections, block VACUUM, and cause cascading failures
estimatedMinutes: 35
---

# Idle in Transaction: The Silent Connection Killer

Of all the connection states visible in `pg_stat_activity`, **idle in transaction** is the most dangerous. It means a session has started a transaction (`BEGIN`) but hasn't committed or rolled back, and isn't currently executing any query. The session is just... sitting there, holding resources.

## What "Idle in Transaction" Means

When a backend shows `state = 'idle in transaction'`, it has:

1. Started a transaction (either explicit `BEGIN` or implicit from a failed auto-commit query in some ORMs)
2. Executed at least one statement
3. Stopped sending queries but hasn't committed or rolled back

```sql
-- Find all idle-in-transaction sessions
SELECT
  pid,
  usename,
  application_name,
  now() - xact_start AS transaction_duration,
  now() - state_change AS idle_duration,
  left(query, 100) AS last_query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY transaction_duration DESC;
```

## Why It's Dangerous: Three Compounding Problems

### Problem 1: Connection Pinning (Pooler Impact)

In transaction pooling mode, a server connection is held for the duration of a transaction. An idle-in-transaction session **pins** a server connection indefinitely:

```
Client opens transaction:     BEGIN;
Client runs a query:          SELECT * FROM users WHERE id = 1;
Client does... nothing:       ← idle in transaction
Server connection held:       ← cannot be reused by other clients
Pool effectively shrinks:     ← 9 available instead of 10
```

If multiple clients do this, the pool drains quickly:

| Idle Txns | Pool Size 10 | Available Connections |
|-----------|-------------|----------------------|
| 0         | 10          | 10                   |
| 3         | 10          | 7                    |
| 7         | 10          | 3                    |
| 10        | 10          | 0 (pool exhausted!)  |

This is the most common cause of pool exhaustion in production.

### Problem 2: VACUUM Blocking

VACUUM can only clean up dead tuples that are no longer visible to **any** active transaction. An idle-in-transaction session holds a snapshot — a point-in-time view of the database — and VACUUM must preserve all tuples that might be visible to that snapshot.

```sql
-- Session A: starts transaction (holds snapshot)
BEGIN;
SELECT 1;  -- Transaction is now "idle in transaction"

-- Session B: updates a million rows
UPDATE large_table SET status = 'archived' WHERE created_at < '2024-01-01';
-- Creates 1 million dead tuples

-- Session B: tries to clean up
VACUUM large_table;
-- VACUUM cannot remove the dead tuples because Session A's
-- snapshot might still need to see the old versions!
```

The result:
- Dead tuples accumulate
- Table bloat grows
- Query performance degrades
- Disk space is wasted

This interaction between idle transactions and VACUUM is one of the most important operational concepts in PostgreSQL.

### Problem 3: Lock Holding

If the idle transaction has acquired any locks (through `SELECT ... FOR UPDATE`, `UPDATE`, `DELETE`, etc.), those locks are held for the entire duration:

```sql
-- Session A: acquires a row lock, then goes idle
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- Now idle in transaction, holding a lock on the row

-- Session B: tries to update the same row
UPDATE accounts SET balance = balance + 50 WHERE id = 1;
-- BLOCKED! Waiting for Session A's lock
```

Session B will wait indefinitely (or until `lock_timeout` or `statement_timeout` is reached). If Session B is also holding locks that other sessions need, you get a cascading pileup.

## Common Causes

### 1. Missing Error Handling

The most common cause. An application does:

```python
# Python pseudocode
connection.execute("BEGIN")
connection.execute("INSERT INTO orders ...")
# An exception occurs here — COMMIT never runs!
# The connection is returned to the app pool while still in a transaction
```

### 2. Long Processing Between Queries

```python
# Anti-pattern: doing work between database calls inside a transaction
connection.execute("BEGIN")
result = connection.execute("SELECT * FROM inventory WHERE id = 42")
# Now we make an HTTP call to a payment service... which takes 30 seconds
response = payment_service.charge(result.price)
connection.execute("UPDATE inventory SET reserved = true WHERE id = 42")
connection.execute("COMMIT")
```

During that 30-second HTTP call, the database connection sits idle in a transaction.

### 3. Interactive psql Sessions

Developers who run `BEGIN` in psql and then get distracted:

```sql
-- Developer starts a transaction
BEGIN;
SELECT * FROM users WHERE id = 1;
-- Gets a phone call... comes back 30 minutes later
-- The transaction has been idle for 30 minutes!
```

### 4. ORM Auto-Transaction Behavior

Some ORMs automatically wrap operations in transactions. If the application doesn't properly commit or roll back, the connection is left in a transaction state.

## Detection and Monitoring

### Find Idle Transactions

```sql
-- All idle-in-transaction sessions, with duration
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  now() - xact_start AS transaction_age,
  now() - state_change AS idle_time,
  left(query, 100) AS last_query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY xact_start;
```

### Find the Worst Offenders

```sql
-- Sessions that have been idle in transaction for more than 5 minutes
SELECT
  pid,
  usename,
  application_name,
  now() - xact_start AS transaction_age,
  left(query, 80) AS last_query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - xact_start > interval '5 minutes'
ORDER BY xact_start;
```

### Monitor the Trend

```sql
-- Count idle-in-transaction sessions over time
-- Run this periodically and track the trend
SELECT
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_txn,
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) AS total
FROM pg_stat_activity
WHERE backend_type = 'client backend';
```

## Prevention: Timeouts

### idle_in_transaction_session_timeout (PostgreSQL)

PostgreSQL can automatically terminate sessions that stay idle in a transaction too long:

```sql
-- Check current setting
SHOW idle_in_transaction_session_timeout;

-- Set it (requires reload or per-session SET)
-- This terminates sessions idle in transaction for more than 60 seconds
SET idle_in_transaction_session_timeout = '60s';
```

When this timeout fires, the session is terminated (not just the transaction — the entire connection is killed). The application will get an error on its next query attempt, which is the correct behavior: it forces the application to reconnect and retry.

**Recommended production setting**: 60-300 seconds, depending on your application's longest legitimate transaction idle time.

```sql
-- Set at the database level (applies to all sessions)
ALTER DATABASE mydb SET idle_in_transaction_session_timeout = '120s';
```

### PGDog's client_idle_in_transaction_timeout

PGDog can also detect and disconnect clients that are idle in a transaction:

```toml
# PGDog configuration
client_idle_in_transaction_timeout = 30000  # milliseconds
```

This works at the pooler level — PGDog disconnects the client and returns the server connection to the pool. The advantage over PostgreSQL's setting is that the server connection is immediately available for other clients, rather than being destroyed and needing to be re-established.

## Remediation: Terminating Stuck Sessions

When you find idle-in-transaction sessions that need to be cleaned up:

```sql
-- First, try canceling the current operation (sends SIGINT)
SELECT pg_cancel_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - xact_start > interval '10 minutes';

-- If pg_cancel_backend doesn't work (session is truly idle),
-- terminate the backend (sends SIGTERM)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - xact_start > interval '10 minutes';
```

**Important**: `pg_cancel_backend()` is gentler — it cancels the current query but keeps the connection alive. For idle-in-transaction sessions, `pg_terminate_backend()` is usually necessary because there's no active query to cancel.

### Impact of Termination

When you terminate a backend that's idle in a transaction:

1. The transaction is **rolled back** (all changes are undone)
2. The connection is **closed**
3. Any held locks are **released**
4. VACUUM can now clean up tuples that were blocked by this transaction's snapshot
5. The application receives an error on its next query and must reconnect

This is almost always the right thing to do. The transaction was doing nothing useful, and the resources it was holding were causing problems.

## Best Practices

1. **Always set `idle_in_transaction_session_timeout`** in production (60-300s)
2. **Keep transactions as short as possible**: Don't do HTTP calls or complex processing inside a transaction
3. **Use connection pool health checks**: Application-side pools should verify connections aren't in a bad state before reusing them
4. **Monitor idle-in-transaction count**: Alert if it exceeds a threshold (e.g., > 5)
5. **Review application error handling**: Ensure every `BEGIN` has a corresponding `COMMIT` or `ROLLBACK` in all code paths, including error paths
6. **Set `lock_timeout`**: Prevent queries from waiting indefinitely for locks held by idle transactions

## Summary

- Idle-in-transaction sessions hold server connections (reducing pool capacity), block VACUUM (causing bloat), and hold locks (blocking other queries)
- Common causes: missing error handling, long processing between queries, distracted interactive sessions, ORM misconfiguration
- Detection: Query `pg_stat_activity` for `state = 'idle in transaction'`
- Prevention: Set `idle_in_transaction_session_timeout` in PostgreSQL and/or `client_idle_in_transaction_timeout` in PGDog
- Remediation: Use `pg_terminate_backend()` to kill stuck sessions and release resources
- This is the single most common cause of pool exhaustion and VACUUM starvation in production

Next, we'll cover operational procedures for managing PGDog in production.
