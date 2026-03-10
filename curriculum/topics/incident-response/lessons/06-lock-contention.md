---
title: "Incident: Lock Contention"
description: Diagnose and resolve a cascading lock contention incident where a single blocking query causes widespread timeouts
estimatedMinutes: 8
---

# Incident: Lock Contention

## Alert

Multiple application services report simultaneously at 4:12 PM:

> **Database queries timing out across all services touching the accounts table.**

The error logs show queries that normally complete in milliseconds are hanging for 30+ seconds before being killed by the statement timeout.

## Symptoms

- Queries against the `accounts` table are hanging indefinitely
- Other tables are completely unaffected
- `pg_stat_activity` shows multiple sessions in "active" state, all waiting on the same table
- `pg_locks` shows several lock requests that are not granted (`granted = false`)
- Database CPU is low, connections are available -- the server is not overloaded
- One session has been holding a lock for several minutes

## Timeline

| Time | Event |
|------|-------|
| 4:00 PM | Analyst starts a long-running analytical query on `accounts` (takes ~10 min) |
| 4:05 PM | Team member runs `ALTER TABLE accounts ADD COLUMN ...` in psql |
| 4:05 PM | ALTER TABLE queues for AccessExclusive lock, blocked by the analytical query |
| 4:06 PM | All new queries on `accounts` start queueing behind the ALTER TABLE |
| 4:12 PM | Timeout alerts fire as the queue grows |

## Background: The Lock Queue Pile-Up

This incident demonstrates one of PostgreSQL's most surprising behaviors: **lock queue fairness**.

The `ALTER TABLE` statement requires an **AccessExclusive** lock -- the strongest lock mode, which conflicts with every other lock type. It cannot acquire this lock until the analytical query (which holds an **AccessShare** lock) completes.

Here is the critical part: while the `ALTER TABLE` is waiting in the lock queue, **all new queries** that need any lock on the `accounts` table (including ordinary `SELECT` statements needing AccessShare) are placed in the queue **behind** the pending AccessExclusive request. PostgreSQL does this to prevent starvation of DDL operations, but it means a single pending `ALTER TABLE` can block all access to the table.

The cascade looks like this:

```
Analytical query (AccessShare, running)
  └─ ALTER TABLE (AccessExclusive, waiting for analytical query)
       └─ SELECT ... (AccessShare, waiting behind ALTER TABLE)
       └─ SELECT ... (AccessShare, waiting behind ALTER TABLE)
       └─ UPDATE ... (RowExclusive, waiting behind ALTER TABLE)
       └─ ... dozens more queries pile up
```

## Why This Is Dangerous

- A single pending DDL statement can effectively make a table unavailable to the entire application
- The cascade happens silently -- the `ALTER TABLE` session might not even show an error
- Without `lock_timeout`, the `ALTER TABLE` will wait indefinitely
- Every second of waiting adds more queued queries, increasing the blast radius

## Diagnostic Approach

1. **Find the blocking chain** -- join `pg_stat_activity` with `pg_locks` to identify who is blocking whom
2. **Terminate the blocker** -- use `pg_terminate_backend()` to break the chain and restore service
3. **Prevent recurrence** -- set `lock_timeout` and `statement_timeout` to ensure that DDL operations fail fast rather than queueing indefinitely

## Concepts Involved

- PostgreSQL lock modes and conflicts (from Transactions)
- `pg_locks` and `pg_stat_activity` for lock analysis (from Operational Health)
- `pg_terminate_backend()` for emergency intervention
- Lock queue behavior and AccessExclusive lock impact
- `lock_timeout` and `statement_timeout` for defensive configuration
