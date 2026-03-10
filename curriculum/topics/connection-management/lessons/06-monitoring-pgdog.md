---
title: Monitoring Connections and PGDog
description: Learn to monitor connection health from both the PostgreSQL side (pg_stat_activity) and the pooler side (PGDog admin commands), and set up effective alerting
estimatedMinutes: 40
---

# Monitoring Connections and PGDog

Effective connection monitoring requires visibility from two perspectives: the **PostgreSQL side** (what's happening with actual database connections) and the **pooler side** (what's happening with client demand and pool utilization). Together, these views give you the full picture of connection health.

## PostgreSQL-Side Monitoring: pg_stat_activity

`pg_stat_activity` is your primary window into what's happening inside PostgreSQL. Each row represents a backend process:

```sql
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  backend_start,
  xact_start,
  query_start,
  state_change,
  state,
  wait_event_type,
  wait_event,
  left(query, 100) AS query
FROM pg_stat_activity
WHERE backend_type = 'client backend'
ORDER BY backend_start;
```

### Key Columns

| Column | What It Tells You |
|--------|------------------|
| `pid` | OS process ID — useful for `pg_terminate_backend()` |
| `state` | Current state: active, idle, idle in transaction |
| `wait_event_type` / `wait_event` | What the backend is waiting on (if anything) |
| `xact_start` | When the current transaction started (NULL if not in transaction) |
| `query_start` | When the current/last query started |
| `state_change` | When the state last changed |
| `query` | The current or last executed query text |

### Connection State Summary

The most important monitoring query — run this regularly:

```sql
SELECT
  state,
  count(*) AS connections,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state
ORDER BY connections DESC;
```

A healthy result looks like:

```
     state      | connections | pct
----------------+-------------+-----
 idle           |          12 | 60.0
 active         |           6 | 30.0
 idle in transaction | 2     | 10.0
```

Warning signs:
- `idle in transaction` > 20% of connections
- `active` = 100% of connections (pool might be saturated)
- Total connections approaching `max_connections`

### Long-Running Queries

Find queries that have been running too long:

```sql
SELECT
  pid,
  usename,
  now() - query_start AS query_duration,
  state,
  left(query, 120) AS query
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND state = 'active'
  AND now() - query_start > interval '30 seconds'
ORDER BY query_duration DESC;
```

### Connection Age Distribution

Understanding how long connections have been open helps identify connection leaks:

```sql
SELECT
  pid,
  usename,
  application_name,
  now() - backend_start AS connection_age,
  state,
  now() - state_change AS time_in_state
FROM pg_stat_activity
WHERE backend_type = 'client backend'
ORDER BY connection_age DESC;
```

In a pooled environment, server connections should be long-lived (they're reused). Very old connections with `idle in transaction` state are suspicious.

## Wait Events: Why Is My Query Slow?

PostgreSQL tracks what each backend is waiting for:

```sql
SELECT
  wait_event_type,
  wait_event,
  count(*) AS waiting_count
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND wait_event IS NOT NULL
GROUP BY wait_event_type, wait_event
ORDER BY waiting_count DESC;
```

Common wait events:

| Wait Event Type | Wait Event | Meaning |
|----------------|------------|---------|
| `Client` | `ClientRead` | Waiting for client to send data (normal for idle connections) |
| `Lock` | `relation` | Waiting to acquire a table lock |
| `Lock` | `transactionid` | Waiting for another transaction to finish |
| `IO` | `DataFileRead` | Waiting for data to be read from disk |
| `LWLock` | Various | Internal lightweight lock contention |

If you see many backends waiting on `Lock` events, you may have a lock contention problem that's causing connection pileup.

## PGDog Admin Console Commands

PGDog provides an SQL-based admin console on a separate port (typically 6433). Connect to it like a regular PostgreSQL connection and run `SHOW` commands.

### SHOW POOLS

The most important admin command:

```sql
-- Shows pool utilization for each database/user combination
SHOW POOLS;
```

Output columns:

| Column | Meaning | Alert Threshold |
|--------|---------|----------------|
| `cl_active` | Clients currently running a query | Informational |
| `cl_waiting` | Clients waiting for a server connection | > 0 for > 30s |
| `sv_active` | Server connections executing queries | Informational |
| `sv_idle` | Server connections available in pool | = 0 is a warning |
| `sv_used` | Server connections recently returned | Informational |
| `sv_login` | Server connections being established | High = connection storm |
| `maxwait` | Longest client wait time (seconds) | > 2s |

### SHOW STATS

Per-database statistics:

```sql
SHOW STATS;
```

Key metrics:
- `total_xact_count`: Total transactions processed
- `total_query_count`: Total queries processed
- `avg_xact_time`: Average transaction duration (microseconds)
- `avg_query_time`: Average query duration (microseconds)
- `total_wait_time`: Total time clients spent waiting for connections

### SHOW CLIENTS

Details about connected clients:

```sql
SHOW CLIENTS;
```

Shows each client connection with its state, connected database, and which server connection (if any) it's currently using.

### SHOW SERVERS

Details about server-side connections:

```sql
SHOW SERVERS;
```

Shows each connection to PostgreSQL with its state, assignment to a client (if any), and database.

## Building a Connection Health Dashboard

Combine PostgreSQL and pooler metrics for a complete view:

### Key Metrics to Track

**From PostgreSQL (`pg_stat_activity`)**:

```sql
-- Metric: Total active connections
SELECT count(*) FROM pg_stat_activity
WHERE backend_type = 'client backend' AND state = 'active';

-- Metric: Idle-in-transaction connections
SELECT count(*) FROM pg_stat_activity
WHERE backend_type = 'client backend' AND state = 'idle in transaction';

-- Metric: Longest running query (seconds)
SELECT EXTRACT(EPOCH FROM max(now() - query_start))
FROM pg_stat_activity
WHERE backend_type = 'client backend' AND state = 'active';

-- Metric: Longest idle-in-transaction (seconds)
SELECT EXTRACT(EPOCH FROM max(now() - xact_start))
FROM pg_stat_activity
WHERE backend_type = 'client backend' AND state = 'idle in transaction';

-- Metric: Connection count vs max_connections
SELECT
  count(*) AS current,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max,
  round(100.0 * count(*) / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 1) AS pct_used
FROM pg_stat_activity;
```

**From PGDog admin (conceptual — when PGDog is running)**:

```sql
-- All from SHOW POOLS:
-- cl_waiting (should be 0)
-- maxwait (should be 0)
-- sv_idle (should be > 0)
```

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Connection utilization (%) | > 70% | > 90% |
| Idle-in-transaction count | > 5 | > 20 |
| Longest query (seconds) | > 60 | > 300 |
| `cl_waiting` (pooler) | > 0 for 30s | > 0 for 2min |
| `maxwait` (pooler) | > 2s | > 10s |
| `sv_idle` (pooler) | = 1 | = 0 |

### Prometheus Metrics

PGDog exposes Prometheus-format metrics at `:9090/metrics`:

```
# Example PGDog Prometheus metrics
pgdog_pool_cl_active{database="mydb",user="app"} 5
pgdog_pool_cl_waiting{database="mydb",user="app"} 0
pgdog_pool_sv_active{database="mydb",user="app"} 5
pgdog_pool_sv_idle{database="mydb",user="app"} 5
pgdog_pool_maxwait{database="mydb",user="app"} 0
pgdog_stats_total_xact_count{database="mydb"} 145230
pgdog_stats_avg_xact_time{database="mydb"} 1250
```

These can be scraped by Prometheus and visualized in Grafana for real-time dashboards and alerting.

## Diagnosing Connection Issues

### Problem: Connections Growing Steadily

```sql
-- Check for connection leaks: connections that have been idle for a long time
SELECT
  pid,
  usename,
  application_name,
  state,
  now() - backend_start AS connection_age,
  now() - state_change AS idle_duration
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND state = 'idle'
  AND now() - state_change > interval '1 hour'
ORDER BY idle_duration DESC;
```

**Cause**: Application not closing connections properly (connection leak)
**Fix**: Review application connection pool settings; set `idle_session_timeout` in PostgreSQL 14+

### Problem: Many Connections in `idle in transaction`

```sql
-- Find idle-in-transaction sessions
SELECT
  pid,
  usename,
  application_name,
  now() - xact_start AS transaction_age,
  left(query, 100) AS last_query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY transaction_age DESC;
```

**Cause**: Application opening transactions and not committing/rolling back
**Fix**: Set `idle_in_transaction_session_timeout`; review application code

### Problem: All Connections Active, Queries Slow

```sql
-- Check for lock contention
SELECT
  wait_event_type,
  wait_event,
  count(*)
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND state = 'active'
  AND wait_event IS NOT NULL
GROUP BY wait_event_type, wait_event
ORDER BY count DESC;
```

**Cause**: Lock contention, slow queries, or resource exhaustion
**Fix**: Identify and fix blocking queries; review query performance

## Summary

- Monitor connections from both PostgreSQL (`pg_stat_activity`) and the pooler (`SHOW POOLS`, `SHOW STATS`)
- The connection state summary (GROUP BY state) is the single most important monitoring query
- Key alerts: `cl_waiting > 0`, connection utilization > 70%, idle-in-transaction count growing
- Wait events reveal why connections are stuck (locks, I/O, client responsiveness)
- PGDog exposes Prometheus metrics for integration with modern monitoring stacks
- Regular connection health checks catch problems before they cause outages

Next, we'll focus on a particularly dangerous connection state: idle in transaction.
