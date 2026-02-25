---
title: Advisory Locks and Patterns
description: Use application-controlled advisory locks for coordination, singleton jobs, and distributed locking
estimatedMinutes: 30
---

# Advisory Locks and Patterns

PostgreSQL's built-in locks work on database objects (rows, tables). But sometimes you need to lock abstract resources — a job ID, a cache key, an external resource. **Advisory locks** let applications create arbitrary locks using integer keys.

## Advisory Lock Basics

Advisory locks are identified by a 64-bit integer key (or a pair of 32-bit integers):

```sql
-- Acquire an advisory lock (blocks until acquired)
SELECT pg_advisory_lock(42);

-- Release it
SELECT pg_advisory_unlock(42);
```

The lock is held by the current session (connection). Any other session trying to acquire the same lock will block until you release it.

## Session vs Transaction Locks

### Session-Level Locks (Default)
Held until explicitly released or the session disconnects:

```sql
SELECT pg_advisory_lock(42);    -- Acquired
-- ... do work ...
SELECT pg_advisory_unlock(42);  -- Released
```

**Warning**: If you forget to unlock, the lock persists until the connection closes. With connection pooling, this can be particularly problematic — the pooled connection holds the lock even after your application code finishes.

### Transaction-Level Locks
Automatically released when the transaction ends:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(42);  -- Acquired
-- ... do work ...
COMMIT;  -- Lock automatically released
```

Transaction-level locks are generally safer because they can't leak.

## Try (Non-Blocking) Variants

The `try` variants attempt to acquire the lock without blocking:

```sql
-- Returns true if acquired, false if already held
SELECT pg_try_advisory_lock(42);

-- Transaction-level non-blocking
SELECT pg_try_advisory_xact_lock(42);
```

This is useful for "if someone else is already doing this work, skip it" patterns.

## Use Cases

### Singleton Job Execution
Ensure only one instance of a batch job runs at a time:

```sql
-- At the start of your job
SELECT pg_try_advisory_lock(12345) AS acquired;
-- If acquired = false, another instance is running — exit
-- If acquired = true, proceed with the job
```

### Distributed Mutex
Coordinate access to an external resource across multiple application instances:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('external-api-rate-limit'));
-- Only one connection at a time reaches here
-- Call the rate-limited external API
COMMIT;  -- Lock released
```

### Cache Invalidation
Prevent multiple processes from rebuilding the same cache simultaneously:

```sql
IF pg_try_advisory_lock(hashtext('rebuild-cache-' || cache_key)) THEN
  -- Rebuild the cache
  -- pg_advisory_unlock(...)
ELSE
  -- Another process is rebuilding, wait or use stale data
END IF;
```

## Monitoring Advisory Locks

```sql
SELECT * FROM pg_locks WHERE locktype = 'advisory';
```

This shows all currently held advisory locks, including the key values and holding PIDs.

## Connection Pooling Caveat

Advisory locks are bound to **database connections**, not application requests. With connection poolers like PgBouncer:

- In **transaction mode** (most common): advisory locks work within a transaction but the connection returns to the pool after COMMIT, potentially leaving session-level locks held by a different user
- In **session mode**: advisory locks work normally but you lose the benefits of connection pooling

**Best practice**: Always use transaction-level advisory locks (`pg_advisory_xact_lock`) when behind a connection pooler.

## Key Takeaways

- Advisory locks are application-controlled locks keyed by integers
- Session-level locks (`pg_advisory_lock`) persist until released or disconnected
- Transaction-level locks (`pg_advisory_xact_lock`) auto-release on COMMIT/ROLLBACK
- `pg_try_advisory_lock` is non-blocking — returns true/false immediately
- Common patterns: singleton jobs, distributed mutexes, cache coordination
- Always use transaction-level locks when connection pooling is involved
- Monitor with `SELECT * FROM pg_locks WHERE locktype = 'advisory'`

This completes our tour of transactions and concurrency control. You now understand isolation levels (and their anomalies), PostgreSQL's locking system (row, table, and advisory), deadlock detection, and practical patterns for safe concurrent access.
