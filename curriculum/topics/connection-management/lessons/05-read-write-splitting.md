---
title: Read/Write Splitting
description: Learn how PGDog automatically routes SELECT queries to read replicas and write queries to the primary, and understand the consistency trade-offs involved
estimatedMinutes: 35
---

# Read/Write Splitting

In a PostgreSQL deployment with read replicas, not every query needs to hit the primary server. SELECT queries can be served by replicas, distributing load and improving throughput. PGDog can automatically route queries based on SQL parsing — no application code changes needed.

## Why Read/Write Splitting?

Most application workloads are heavily read-biased:

- **E-commerce**: Product browsing (reads) far exceeds purchases (writes)
- **SaaS dashboards**: Reporting queries (reads) dominate data entry (writes)
- **APIs**: GET requests typically outnumber POST/PUT/DELETE by 5-10x

By directing reads to replicas, you:
- **Reduce primary load**: The primary handles only writes and critical reads
- **Scale horizontally**: Add more replicas to handle more read traffic
- **Improve availability**: If the primary is busy with a migration, reads continue on replicas

## PostgreSQL Streaming Replication

Before diving into routing, let's understand the replication setup:

```
Primary (read-write)
    │
    ├── WAL stream ──→ Replica 1 (read-only)
    │
    └── WAL stream ──→ Replica 2 (read-only)
```

The primary writes WAL (Write-Ahead Log) records and streams them to replicas. Replicas apply these records to stay in sync. The replication lag — the delay between a write on the primary and its visibility on a replica — is typically sub-second but can grow under load.

```sql
-- Check replication-related settings on the primary
SHOW wal_level;              -- Should be 'replica' or 'logical'
SHOW max_wal_senders;        -- Max number of replication connections
SHOW synchronous_commit;     -- 'on', 'off', 'remote_apply', etc.

-- Check if this server is primary or replica
SELECT pg_is_in_recovery();  -- false = primary, true = replica
```

## How PGDog Routes Queries

PGDog includes a SQL parser that analyzes each query to determine where to send it:

### Queries That Go to the Primary (read-write)

- `INSERT`, `UPDATE`, `DELETE`, `MERGE`
- `CREATE`, `ALTER`, `DROP` (DDL)
- `SELECT ... FOR UPDATE` / `FOR SHARE` (row locking)
- `SELECT` that calls a volatile function (e.g., `nextval()`, `random()`)
- Any query inside an explicit `BEGIN` block (the whole transaction goes to one server)
- `SET`, `DISCARD`, `LOCK`
- `COPY ... FROM` (data loading)

### Queries That Go to Replicas (read-only)

- Simple `SELECT` queries (no `FOR UPDATE`)
- `SELECT` with immutable/stable functions
- `EXPLAIN` and `EXPLAIN ANALYZE`
- `SHOW` commands

### PGDog Configuration for Replicas

```toml
[pools.default.shards.0.servers.0]
host = "postgres-primary"
port = 5432
role = "primary"

[pools.default.shards.0.servers.1]
host = "postgres-replica-1"
port = 5432
role = "replica"

[pools.default.shards.0.servers.2]
host = "postgres-replica-2"
port = 5432
role = "replica"
```

With this configuration, PGDog automatically routes SELECT queries to one of the replicas (load-balanced) and writes to the primary.

## The Consistency Trade-Off

Read/write splitting introduces a fundamental trade-off: **read-your-writes consistency**.

### The Problem

```
Time 0: Client INSERTs a row (goes to primary)
Time 1: Client SELECTs the row (goes to replica)
        → Row might not be there yet! (replication lag)
```

This can cause confusing bugs:
- User creates a record, but the next page load doesn't show it
- API returns "not found" immediately after a successful create
- Tests pass locally (single server) but fail in staging (with replicas)

### Replication Lag

You can measure replication lag:

```sql
-- On the primary: check replication status
SELECT
  client_addr,
  state,
  sent_lsn,
  write_lsn,
  flush_lsn,
  replay_lsn,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes
FROM pg_stat_replication;
```

```sql
-- On a replica: check how far behind it is
SELECT
  now() - pg_last_xact_replay_timestamp() AS replication_delay;
```

### Strategies for Consistency

**1. Route critical reads to primary**

Force specific queries to the primary by wrapping them in a transaction or using a comment hint:

```sql
-- Option 1: Explicit transaction forces primary routing
BEGIN;
SELECT * FROM orders WHERE id = 12345;
COMMIT;

-- Option 2: Some poolers support comment-based routing hints
/* primary */ SELECT * FROM orders WHERE id = 12345;
```

**2. Synchronous replication**

Configure PostgreSQL so writes don't commit until replicas confirm:

```sql
SHOW synchronous_commit;
-- 'remote_apply' = wait until replica has applied the WAL
-- This eliminates lag but adds write latency
```

**3. Application-level causal consistency**

After a write, the application routes subsequent reads for that user to the primary for a short window (e.g., 5 seconds).

**4. Accept eventual consistency**

For many reads (dashboards, reports, search results), slightly stale data is perfectly acceptable. Not every read needs to hit the primary.

## Identifying Read vs Write Queries

Understanding which queries are reads vs writes is important even without replicas — it helps you understand your workload profile:

```sql
-- Check if the current server is a primary or replica
SELECT
  CASE
    WHEN pg_is_in_recovery() THEN 'replica'
    ELSE 'primary'
  END AS server_role;
```

A useful mental model for query classification:

| Query Pattern | Classification | Route To |
|--------------|---------------|----------|
| `SELECT ... FROM ...` | Read | Replica |
| `SELECT ... FOR UPDATE` | Write (acquires locks) | Primary |
| `INSERT INTO ...` | Write | Primary |
| `UPDATE ... SET ...` | Write | Primary |
| `DELETE FROM ...` | Write | Primary |
| `SELECT nextval(...)` | Write (modifies sequence) | Primary |
| `SELECT func()` where `func` is VOLATILE | Write (might modify data) | Primary |
| `WITH cte AS (...) SELECT ...` | Read (if no DML in CTE) | Replica |
| `WITH cte AS (DELETE ... RETURNING *) SELECT ...` | Write (CTE has DML) | Primary |

## Transactions and Routing

When a client begins an explicit transaction, the entire transaction must go to a single server:

```sql
BEGIN;
-- All queries in this transaction go to the PRIMARY
-- even if they're all SELECTs
SELECT * FROM users WHERE id = 1;
SELECT * FROM orders WHERE user_id = 1;
COMMIT;
```

This is because:
1. The transaction might contain writes later
2. The transaction needs consistent reads from a single source
3. Transaction state (locks, visibility) exists on one server

If you want reads inside a transaction to go to a replica, some poolers support read-only transaction hints:

```sql
BEGIN READ ONLY;
-- PGDog can route this to a replica
SELECT * FROM users WHERE id = 1;
COMMIT;
```

## Monitoring Read/Write Distribution

Understanding your read/write ratio helps you plan capacity:

```sql
-- Approximate read/write ratio from pg_stat_statements
-- (requires pg_stat_statements extension)
SELECT
  CASE
    WHEN query ILIKE 'SELECT%' THEN 'read'
    ELSE 'write'
  END AS query_type,
  count(*) AS total_calls,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percentage
FROM pg_stat_statements
GROUP BY 1
ORDER BY 2 DESC;
```

If 80%+ of your calls are reads, you'll see significant benefit from read/write splitting with replicas.

## Summary

- PGDog can automatically route SELECT queries to replicas and writes to the primary using SQL parsing
- This distributes load and allows horizontal scaling for read-heavy workloads
- The main trade-off is read-your-writes consistency — replicas may lag behind the primary
- Replication lag is usually sub-second but can spike under heavy write load
- Strategies for consistency include routing critical reads to primary, synchronous replication, and application-level causal consistency
- All queries in an explicit transaction go to the same server (usually primary)
- Monitor your read/write ratio to understand the potential benefit of splitting

Next, we'll look at how to monitor PGDog and PostgreSQL connections in production.
