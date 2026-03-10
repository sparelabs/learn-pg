---
title: "Incident: Connections Exhausted"
description: Diagnose and resolve a connection exhaustion incident caused by idle-in-transaction sessions
estimatedMinutes: 8
---

# Incident: Connections Exhausted

## Alert

Your monitoring dashboard fires at 9:23 AM:

> **PostgreSQL active connections at 98% of max_connections.**

New application requests are failing with `FATAL: too many connections for role` errors. Users are seeing 500 errors across the platform.

## Symptoms

- New database connections are being refused with "too many connections" errors
- `max_connections` is set to 100, and `pg_stat_activity` shows 97 active connections
- Many connections appear to be doing nothing -- they are not executing queries
- The connection pool metrics show clients waiting for available connections
- Application logs show connection checkout timeouts
- Database CPU and memory are low -- the server is not overloaded, just out of connection slots

## Timeline

| Time | Event |
|------|-------|
| Monday 8:00 AM | New background worker deployed as part of routine release |
| Tuesday 9:00 AM | Monitoring shows connections creeping up: 60, then 70, then 80 |
| Tuesday 9:23 AM | Connection alert fires at 98% capacity |
| Tuesday 9:25 AM | User-facing errors begin |

## Background

A recent code change introduced a new background worker that opens a database transaction to read configuration values and process tasks. The worker handles errors in its business logic, but the error handling path has a bug: it catches the exception and continues to the next task without committing or rolling back the database transaction.

Each leaked transaction holds a database connection in the **"idle in transaction"** state. The connection cannot be returned to the pool because the transaction is still open. Over the past 24 hours, hundreds of these leaked transactions accumulated, each one consuming a connection slot.

## Why This Is Dangerous

Idle-in-transaction sessions are more harmful than they appear:

- **Connection exhaustion**: Each one consumes a connection slot that could be used for real work
- **VACUUM blocking**: The open transaction holds a snapshot, preventing VACUUM from cleaning dead tuples created after that snapshot was taken
- **Lock retention**: Any locks acquired during the transaction are held until it commits or rolls back
- **Replication slot risk**: On replicas, idle transactions can prevent WAL segments from being recycled

A single leaked transaction that stays open for hours can cause cascading problems across the entire system.

## Diagnostic Approach

When connections are exhausted, the immediate priority is restoring service:

1. **Assess the connection state** -- query `pg_stat_activity` to understand the breakdown of connection states (active, idle, idle in transaction)
2. **Find the culprits** -- identify the idle-in-transaction sessions and how long they have been open
3. **Terminate the offenders** -- use `pg_terminate_backend()` to kill long-running idle transactions and free connections

## Prevention

After resolving the immediate incident, you should:
- Set `idle_in_transaction_session_timeout` (e.g., `'10min'`) to automatically terminate sessions that sit idle in a transaction too long
- Fix the application code to properly close transactions in error paths
- Add monitoring on idle-in-transaction connection counts

## Concepts Involved

- `pg_stat_activity` views and connection states (from Operational Health)
- Transaction lifecycle and idle-in-transaction state (from Transactions)
- `pg_terminate_backend()` for session management
- Connection pool behavior under exhaustion
