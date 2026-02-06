---
title: Connection and Lock Monitoring
description: Monitor database connections, identify blocking queries, and understand PostgreSQL locking
estimatedMinutes: 40
---

# Connection and Lock Monitoring

Effective connection and lock management is critical for maintaining database performance and availability. PostgreSQL's locking mechanism ensures data integrity in concurrent environments, but improper handling can lead to performance bottlenecks and even application failures.

## Connection Management

### Understanding Connection Limits

PostgreSQL has a maximum number of connections defined by `max_connections`:

```sql
-- Check current connection limit
SHOW max_connections;

-- Check reserved connections for superusers
SHOW superuser_reserved_connections;

-- Available connections for regular users
SELECT
  (current_setting('max_connections')::int -
   current_setting('superuser_reserved_connections')::int) AS available_to_users;
```

### Monitoring Current Connections

```sql
-- Count connections by database
SELECT
  datname,
  COUNT(*) AS connections,
  MAX(current_setting('max_connections')::int) AS max_connections,
  round(
    100.0 * COUNT(*) / MAX(current_setting('max_connections')::int),
    2
  ) AS pct_used
FROM pg_stat_activity
WHERE datname IS NOT NULL
GROUP BY datname
ORDER BY connections DESC;

-- Connections by user and application
SELECT
  usename,
  application_name,
  COUNT(*) AS connection_count,
  MAX(backend_start) AS latest_connection,
  MIN(backend_start) AS oldest_connection
FROM pg_stat_activity
WHERE pid != pg_backend_pid()
GROUP BY usename, application_name
ORDER BY connection_count DESC;

-- Connection states
SELECT
  state,
  COUNT(*) AS count,
  round(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM pg_stat_activity
GROUP BY state
ORDER BY count DESC;
```

### Connection Pooling

When approaching connection limits:

```sql
-- Identify idle connections
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  backend_start,
  state_change,
  age(now(), state_change) AS idle_time,
  state
FROM pg_stat_activity
WHERE state = 'idle'
  AND backend_type = 'client backend'
ORDER BY state_change;

-- Idle in transaction (dangerous!)
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state_change,
  age(now(), state_change) AS transaction_idle_time,
  query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY state_change;
```

**Idle in transaction** connections are particularly problematic:
- They hold locks
- They prevent vacuum from cleaning old rows
- They consume connection slots

### Terminating Connections

```sql
-- Gracefully terminate a connection (sends SIGTERM)
SELECT pg_terminate_backend(pid);

-- Force terminate a connection (sends SIGKILL - use as last resort)
SELECT pg_cancel_backend(pid);

-- Terminate all idle connections for a specific database
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'mydb'
  AND state = 'idle'
  AND backend_type = 'client backend'
  AND pid != pg_backend_pid();
```

## Understanding PostgreSQL Locks

PostgreSQL uses Multi-Version Concurrency Control (MVCC) to minimize locking, but various locks are still necessary:

### Lock Modes

From least to most restrictive:

1. **ACCESS SHARE**: Acquired by SELECT queries
2. **ROW SHARE**: Acquired by SELECT FOR UPDATE/SHARE
3. **ROW EXCLUSIVE**: Acquired by INSERT, UPDATE, DELETE
4. **SHARE UPDATE EXCLUSIVE**: Acquired by VACUUM, CREATE INDEX CONCURRENTLY
5. **SHARE**: Acquired by CREATE INDEX
6. **SHARE ROW EXCLUSIVE**: Rarely used
7. **EXCLUSIVE**: Blocks all concurrent access except ACCESS SHARE
8. **ACCESS EXCLUSIVE**: Blocks all concurrent access (ALTER TABLE, DROP TABLE, TRUNCATE)

### Lock Conflicts

Each lock mode conflicts with certain other modes. For example:
- ACCESS EXCLUSIVE conflicts with everything
- ROW EXCLUSIVE conflicts with SHARE, SHARE ROW EXCLUSIVE, EXCLUSIVE, ACCESS EXCLUSIVE

## Monitoring Locks

### Current Locks

```sql
-- All locks in the system
SELECT
  locktype,
  database,
  relation::regclass AS table_name,
  page,
  tuple,
  virtualxid,
  transactionid,
  mode,
  granted,
  pid
FROM pg_locks
ORDER BY pid;

-- Locks by type and mode
SELECT
  locktype,
  mode,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE granted) AS granted_count,
  COUNT(*) FILTER (WHERE NOT granted) AS waiting_count
FROM pg_locks
GROUP BY locktype, mode
ORDER BY count DESC;
```

### Identifying Blocking Queries

The most critical monitoring query - identifying which queries are blocking others:

```sql
-- Blocking and blocked queries
SELECT
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_query,
  blocking_activity.query AS blocking_query,
  blocked_activity.application_name AS blocked_app,
  blocking_activity.application_name AS blocking_app
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

### Lock Wait Trees

For complex blocking scenarios:

```sql
-- Recursive CTE to show complete blocking tree
WITH RECURSIVE lock_tree AS (
  -- Get all blocking relationships
  SELECT
    waiting.pid AS waiting_pid,
    waiting.query AS waiting_query,
    blocking.pid AS blocking_pid,
    blocking.query AS blocking_query,
    1 AS level,
    ARRAY[waiting.pid] AS path
  FROM pg_locks waiting_lock
  JOIN pg_stat_activity waiting ON waiting.pid = waiting_lock.pid
  JOIN pg_locks blocking_lock ON (
    blocking_lock.locktype = waiting_lock.locktype
    AND blocking_lock.database IS NOT DISTINCT FROM waiting_lock.database
    AND blocking_lock.relation IS NOT DISTINCT FROM waiting_lock.relation
    AND blocking_lock.page IS NOT DISTINCT FROM waiting_lock.page
    AND blocking_lock.tuple IS NOT DISTINCT FROM waiting_lock.tuple
    AND blocking_lock.virtualxid IS NOT DISTINCT FROM waiting_lock.virtualxid
    AND blocking_lock.transactionid IS NOT DISTINCT FROM waiting_lock.transactionid
    AND blocking_lock.classid IS NOT DISTINCT FROM waiting_lock.classid
    AND blocking_lock.objid IS NOT DISTINCT FROM waiting_lock.objid
    AND blocking_lock.objsubid IS NOT DISTINCT FROM waiting_lock.objsubid
    AND blocking_lock.pid != waiting_lock.pid
  )
  JOIN pg_stat_activity blocking ON blocking.pid = blocking_lock.pid
  WHERE NOT waiting_lock.granted

  UNION ALL

  -- Recursively find chains
  SELECT
    lt.waiting_pid,
    lt.waiting_query,
    blocking.pid,
    blocking.query,
    lt.level + 1,
    lt.path || blocking.pid
  FROM lock_tree lt
  JOIN pg_locks waiting_lock ON waiting_lock.pid = lt.blocking_pid
  JOIN pg_locks blocking_lock ON (
    blocking_lock.locktype = waiting_lock.locktype
    AND blocking_lock.database IS NOT DISTINCT FROM waiting_lock.database
    AND blocking_lock.relation IS NOT DISTINCT FROM waiting_lock.relation
    AND blocking_lock.pid != waiting_lock.pid
  )
  JOIN pg_stat_activity blocking ON blocking.pid = blocking_lock.pid
  WHERE NOT waiting_lock.granted
    AND NOT blocking.pid = ANY(lt.path)
)
SELECT * FROM lock_tree
ORDER BY level, waiting_pid;
```

### Table-Level Locks

```sql
-- What locks exist on specific tables
SELECT
  l.locktype,
  l.mode,
  l.granted,
  l.pid,
  a.usename,
  a.query,
  a.query_start
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
JOIN pg_class c ON c.oid = l.relation
WHERE c.relname = 'your_table_name'
ORDER BY l.granted, l.pid;
```

## Deadlock Detection

PostgreSQL automatically detects deadlocks:

```sql
-- Check deadlock_timeout setting
SHOW deadlock_timeout;

-- View recent deadlocks in logs
-- (requires log_lock_waits = on and appropriate logging)
```

When a deadlock is detected:
- One transaction is aborted (gets a deadlock error)
- The other transaction can proceed
- Details are written to the PostgreSQL log

### Preventing Deadlocks

1. **Consistent lock ordering**: Always acquire locks in the same order
2. **Keep transactions short**: Less time holding locks
3. **Use appropriate isolation levels**: Not everything needs SERIALIZABLE
4. **Avoid user interaction in transactions**: Don't wait for user input while holding locks

## Lock Timeouts

Configure timeouts to prevent indefinite blocking:

```sql
-- Statement timeout (kills long-running queries)
SET statement_timeout = '30s';

-- Lock timeout (fails if can't acquire lock)
SET lock_timeout = '5s';

-- Idle in transaction timeout (PostgreSQL 9.6+)
SET idle_in_transaction_session_timeout = '10min';
```

## Monitoring Query Waits

PostgreSQL 10+ provides detailed wait event tracking:

```sql
-- Active queries and what they're waiting for
SELECT
  pid,
  usename,
  wait_event_type,
  wait_event,
  state,
  query,
  age(clock_timestamp(), query_start) AS query_duration,
  age(clock_timestamp(), state_change) AS state_duration
FROM pg_stat_activity
WHERE state != 'idle'
  AND pid != pg_backend_pid()
ORDER BY query_start;

-- Count of wait events
SELECT
  wait_event_type,
  wait_event,
  COUNT(*) AS count
FROM pg_stat_activity
WHERE wait_event IS NOT NULL
GROUP BY wait_event_type, wait_event
ORDER BY count DESC;
```

### Common Wait Events

- **Lock**: Waiting for a heavyweight lock
- **LWLock**: Waiting for a lightweight lock (internal)
- **BufferPin**: Waiting to access a data buffer
- **IO**: Waiting for I/O operation
- **Client**: Waiting for client (e.g., application not reading results)

## Best Practices

1. **Use connection pooling**: Tools like PgBouncer reduce connection overhead
2. **Monitor idle in transaction**: Set alerts for long idle transactions
3. **Keep transactions short**: Acquire locks as late as possible, release them as soon as possible
4. **Use appropriate lock modes**: Don't use heavier locks than necessary
5. **Set timeouts**: Prevent indefinite waits
6. **Monitor lock waits**: Track `log_lock_waits` to identify contention
7. **Regular monitoring**: Check for blocking queries during peak hours

## Troubleshooting Checklist

When experiencing lock contention:

1. Identify blocking queries (use blocking query above)
2. Check query duration and lock wait time
3. Determine if the blocker is idle in transaction
4. Review application code for transaction boundaries
5. Consider killing the blocking query if necessary
6. Review logs for patterns
7. Optimize queries or add indexes to reduce lock hold time

## Next Steps

In the next lesson, we'll learn how to identify slow queries and performance bottlenecks using the tools we've covered.
