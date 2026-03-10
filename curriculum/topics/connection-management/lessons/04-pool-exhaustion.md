---
title: Pool Exhaustion and Connection Limits
description: Understand what happens when all pooled connections are busy, how checkout timeouts work, and how to properly size your connection pool
estimatedMinutes: 35
---

# Pool Exhaustion and Connection Limits

Pool exhaustion is one of the most common production incidents with PostgreSQL. It happens when every server connection in the pool is occupied and new clients can't get a connection. Understanding why this happens, how to detect it, and how to prevent it is critical operational knowledge.

## What Pool Exhaustion Looks Like

When all server connections in the pool are busy:

1. A new client tries to execute a query
2. The pooler has no available server connection to assign
3. The client **waits** in a queue
4. If a server connection becomes free before the timeout, the client proceeds
5. If not, the client gets a **timeout error**

From the application's perspective, this manifests as:

- Queries that normally take 5ms suddenly take 10-30 seconds (waiting for a connection)
- Eventually, timeout errors like: `ERROR: connection pool timeout: waited too long for a server connection`
- A cascade failure where slow responses cause request backlogs, which cause more connections to be held longer, which causes more exhaustion

## The Checkout Timeout

The **checkout timeout** (also called query timeout or pool timeout) is how long a client will wait for an available server connection before giving up. In PGDog:

```toml
# PGDog configuration
checkout_timeout = 5000  # milliseconds (5 seconds)
```

This is a critical safety parameter:

- **Too short** (e.g., 100ms): Clients fail immediately during brief traffic spikes, even though a connection might have become available moments later
- **Too long** (e.g., 60s): Application threads/processes pile up waiting, consuming memory and potentially causing cascading failures
- **Good default**: 5-10 seconds for most web applications

The checkout timeout is different from PostgreSQL's `statement_timeout`:

| Setting | Where | What it limits |
|---------|-------|---------------|
| `checkout_timeout` | Pooler (PGDog) | Time waiting to get a server connection |
| `statement_timeout` | PostgreSQL | Time a query can execute |
| `idle_in_transaction_session_timeout` | PostgreSQL | Time a transaction can sit idle |

## Anatomy of a Pool Exhaustion Event

Let's trace through a typical pool exhaustion scenario:

```
Time 0:00 - Pool has 10 server connections, all idle
Time 0:01 - Normal traffic: 5 connections active, 5 idle
Time 0:02 - A slow query starts on connection #6 (will take 30 seconds)
Time 0:03 - Traffic spike: all 10 connections now active
Time 0:04 - New client arrives, no connections available → starts waiting
Time 0:05 - More clients arrive → queue grows
Time 0:09 - First clients in queue hit checkout_timeout → errors
Time 0:32 - Slow query finishes, connection #6 returns to pool
Time 0:33 - Queued clients start getting connections, backlog clears
```

The root cause wasn't the traffic spike — it was the combination of the slow query and the spike. If the pool had been larger, or the slow query had a `statement_timeout`, the exhaustion might not have happened.

## Monitoring Pool State

### From PostgreSQL Side

Even without access to the pooler's admin console, you can detect pool-related issues from PostgreSQL:

```sql
-- How many connections are in use vs the maximum?
SELECT
  (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend') AS current_connections,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections;
```

```sql
-- Are connections actually doing work, or just sitting there?
SELECT state, count(*)
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state;
```

If you see many `idle in transaction` connections, those are holding server connections without doing work — a major cause of pool exhaustion. We'll cover this in detail in lesson 07.

### From PGDog Admin Console

On the pooler side, the admin console provides direct visibility:

```sql
-- PGDog admin (port 6433)
SHOW POOLS;
```

Key columns to watch:

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| `cl_waiting` | 0 | > 0 | > 10 |
| `maxwait` | 0 | > 1s | > 5s |
| `sv_idle` | > 2 | 1 | 0 |
| `sv_active` | < pool_size | = pool_size | = pool_size + cl_waiting > 0 |

## Sizing the Connection Pool

### The Formula

A good starting point:

```
pool_size = (CPU cores × 2) + effective_spindle_count
```

For a cloud database with 4 vCPUs on SSD:
- `(4 × 2) + 1 = 9` → round to **10**

This formula comes from the PostgreSQL wiki and reflects the fact that connections spend time either computing (CPU-bound) or waiting for I/O (disk-bound).

### Why Smaller Pools Can Be Faster

Counter-intuitively, a smaller pool often delivers **higher throughput** than a larger one:

**Small pool (10 connections)**:
- Low lock contention
- Low context switching
- Efficient CPU cache usage
- Each query gets more resources

**Large pool (200 connections)**:
- High lock contention (especially on hot rows)
- Heavy context switching between 200 processes
- CPU cache thrashing
- Each query gets fewer resources
- Overall throughput may be **lower** despite more connections

This is why the HikariCP connection pool documentation (a popular Java pool) recommends starting at 10 and only increasing if benchmarks show improvement.

### Connection Pool Sizing Table

| Database vCPUs | Recommended Pool Size | Max with Tuning |
|----------------|----------------------|-----------------|
| 2              | 5-8                  | 15              |
| 4              | 8-12                 | 25              |
| 8              | 15-20                | 40              |
| 16             | 25-35                | 60              |
| 32             | 40-60                | 100             |

These are server-side connections (the pool). Client connections to the pooler can be 10-100x higher.

## PostgreSQL's max_connections and the Pooler

With a pooler in place, you should set PostgreSQL's `max_connections` to be slightly larger than the total pool size across all pooler instances:

```sql
SHOW max_connections;
```

For example:
- PGDog pool size: 20
- Number of PGDog instances: 2
- PostgreSQL `max_connections`: 50 (20×2 + 10 buffer)

The buffer accounts for:
- Superuser reserved connections (default 3)
- Monitoring connections
- Manual DBA connections
- Connections from background processes (replication, etc.)

## Preventing Pool Exhaustion

### 1. Set Statement Timeouts

The single most effective prevention:

```sql
-- Kill queries that run too long
SET statement_timeout = '30s';

-- For specific operations that need more time:
BEGIN;
SET LOCAL statement_timeout = '5min';
-- Long-running migration or report
COMMIT;
```

### 2. Set Idle-in-Transaction Timeouts

Prevent forgotten transactions from holding connections:

```sql
-- Kill transactions that sit idle
SET idle_in_transaction_session_timeout = '60s';
```

### 3. Use Application-Side Timeouts

Don't rely only on database-side timeouts. Set timeouts at every layer:

```
Application HTTP timeout:  30s
Connection checkout timeout: 5s (pooler)
Statement timeout:          30s (PostgreSQL)
Idle-in-transaction timeout: 60s (PostgreSQL)
```

### 4. Monitor and Alert

Set up alerts for:
- `cl_waiting > 0` for more than 30 seconds
- `maxwait > 2s`
- Connection count approaching `max_connections`
- Any `idle in transaction` sessions older than 5 minutes

## Simulating Pool Exhaustion (Conceptual)

In a production environment with PGDog, you could observe pool exhaustion by:

1. Setting a small pool size (e.g., 2)
2. Opening 2 transactions through the pooler and holding them open (`BEGIN; SELECT pg_sleep(30);`)
3. Trying to execute a query through the pooler from a 3rd client
4. The 3rd client would wait (up to `checkout_timeout`) and then fail

Even without a pooler, you can observe the connection limit:

```sql
-- Check how close you are to the limit
SELECT
  count(*) AS current,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS maximum,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') - count(*) AS remaining
FROM pg_stat_activity;
```

## Recovery from Pool Exhaustion

When pool exhaustion happens in production:

1. **Identify the cause**: Check for long-running queries or idle transactions
2. **Terminate offenders**: `SELECT pg_terminate_backend(pid)` for stuck sessions
3. **Don't increase pool size as a first reaction**: Fix the root cause first
4. **Review timeouts**: Ensure `statement_timeout` and `idle_in_transaction_session_timeout` are set
5. **Post-mortem**: Understand why the exhaustion happened and prevent recurrence

## Summary

- Pool exhaustion occurs when all server connections are occupied and new clients can't get one
- The checkout timeout controls how long clients wait for a connection before failing
- Smaller pools often perform better than larger ones due to reduced contention
- Start with `pool_size = (CPU cores × 2) + 1` and adjust based on monitoring
- Statement timeouts and idle-in-transaction timeouts are your best prevention tools
- Monitor `cl_waiting` and `maxwait` from the pooler's admin console
- When exhaustion happens, fix the root cause (slow queries, stuck transactions) before increasing pool size

Next, we'll look at how PGDog can automatically route read queries to replicas and write queries to the primary.
