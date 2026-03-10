---
title: "PostgreSQL's Process-Per-Connection Model"
description: Learn how PostgreSQL handles client connections by forking a dedicated backend process for each one, and why this architectural choice has profound implications for scalability
estimatedMinutes: 35
---

# PostgreSQL's Process-Per-Connection Model

Every time an application opens a connection to PostgreSQL, the database forks an entirely new operating system process to handle it. This design decision, made in the 1990s, gives PostgreSQL excellent stability and isolation — but it comes with costs that every production operator needs to understand.

## The Postmaster and Backend Processes

When PostgreSQL starts, a single process called the **postmaster** begins listening for incoming connections (typically on port 5432). For every new client connection:

1. The postmaster accepts the TCP connection
2. It authenticates the client (checking `pg_hba.conf`, passwords, certificates, etc.)
3. It **forks** a new child process — a **backend** — dedicated to that client
4. The backend handles all SQL commands from that client until disconnection

You can see this architecture in action:

```sql
-- View all current backend processes
SELECT pid, usename, application_name, client_addr, backend_start, state
FROM pg_stat_activity
WHERE backend_type = 'client backend';
```

Each row in this result represents a separate OS process. You can confirm this by checking the process list on the server:

```sql
-- The pid column matches actual OS process IDs
SELECT pid, usename, state, query
FROM pg_stat_activity
WHERE backend_type = 'client backend';
```

## Memory Cost Per Connection

Each backend process allocates its own memory for:

- **work_mem**: Used for sort operations, hash joins, etc. (default 4MB, allocated per operation)
- **temp_buffers**: For temporary tables (default 8MB)
- **Stack space**: Typically 2-4MB
- **Query parsing/planning structures**: Variable, but typically 1-2MB
- **Catalog caches**: Each backend maintains its own copy of system catalog data

A rough rule of thumb: each idle connection consumes **2-3MB of RAM**, and active connections running complex queries can use significantly more.

```sql
-- Check current memory-related settings
SHOW work_mem;
SHOW temp_buffers;
SHOW shared_buffers;
```

With 100 connections, you're looking at 200-300MB just for backend overhead. With 1,000 connections, that's 2-3GB — and this is before any actual query work.

## The GetSnapshotData() Bottleneck

PostgreSQL uses MVCC (Multi-Version Concurrency Control), which means every query needs a **snapshot** of which transactions are currently active. This snapshot is computed by `GetSnapshotData()`, a function that iterates over all backend processes.

The cost of this function is **O(n)** where n is the number of connections — not just active queries, but all connections, including idle ones. This means:

- 100 connections: snapshot computation is fast
- 1,000 connections: noticeable overhead on every query start
- 10,000 connections: severe performance degradation

This is the hidden cost of idle connections. Even if a connection is doing nothing, it still forces every other connection to do more work during snapshot computation.

## The Microsoft Benchmark

A well-known benchmark by Microsoft demonstrated this effect dramatically:

- **48 active connections + 0 idle**: Baseline throughput
- **48 active connections + 10,000 idle**: **60% less throughput**

The active query count didn't change — the idle connections themselves degraded performance. This is because every transaction start had to scan through 10,048 processes for snapshot computation.

> **Key insight**: Idle connections are not free. They consume memory and degrade performance for all other connections through the snapshot bottleneck.

## Why max_connections = 10,000 Is a Bad Idea

Given the above, you can understand why setting `max_connections` to a very high value is counterproductive:

```sql
-- Check your current max_connections setting
SHOW max_connections;
```

The default is typically 100, which is reasonable for direct connections. In practice:

| Connections | Memory Overhead | Snapshot Impact |
|-------------|----------------|-----------------|
| 100         | ~300MB         | Negligible      |
| 500         | ~1.5GB         | Measurable      |
| 1,000       | ~3GB           | Significant     |
| 5,000       | ~15GB          | Severe          |
| 10,000      | ~30GB          | Catastrophic    |

The right approach is to keep `max_connections` relatively low (100-300 for most workloads) and use a **connection pooler** to multiplex many application connections onto a smaller number of database connections.

## Connection Lifecycle

Understanding the full lifecycle of a connection helps explain why connection pooling is so valuable:

```
1. TCP handshake          (~0.5ms local, ~1-5ms remote)
2. TLS negotiation        (~2-5ms if enabled)
3. Authentication         (~1-10ms depending on method)
4. Fork new process       (~1-2ms)
5. Initialize backend     (~5-10ms, catalog cache warmup)
---
Total: ~10-30ms per new connection
```

If your application opens a connection per HTTP request and your web server handles 1,000 requests/second, that's 1,000 fork operations per second — plus the memory and snapshot overhead of all those connections existing simultaneously.

## Observing Connection Activity

PostgreSQL provides rich visibility into connection state through `pg_stat_activity`:

```sql
-- Summary of connection states
SELECT state, count(*)
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state
ORDER BY count DESC;
```

The possible states are:

| State                | Meaning |
|---------------------|---------|
| `active`            | Currently executing a query |
| `idle`              | Connected but not doing anything |
| `idle in transaction`| Inside a BEGIN block but not executing |
| `idle in transaction (aborted)` | Transaction has errored but not rolled back |
| `fastpath function call` | Executing a fast-path function |
| `disabled`          | Tracking disabled for this backend |

In a healthy system, you want to see mostly `active` and `idle` connections. A large number of `idle in transaction` connections is a red flag — we'll cover this in detail in lesson 07.

```sql
-- Detailed view with timing information
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  now() - backend_start AS connection_age,
  now() - state_change AS time_in_current_state,
  left(query, 80) AS current_query
FROM pg_stat_activity
WHERE backend_type = 'client backend'
ORDER BY backend_start;
```

## Superuser Reserved Connections

PostgreSQL reserves a few connection slots for superusers, so administrators can always connect even when `max_connections` is reached:

```sql
SHOW superuser_reserved_connections;  -- Default: 3
```

This means if `max_connections = 100`, only 97 are available to normal users. The remaining 3 are reserved so a DBA can connect to diagnose and fix connection exhaustion issues.

## Summary

- PostgreSQL forks a new OS process for every client connection
- Each connection costs ~2-3MB of RAM even when idle
- The snapshot computation (GetSnapshotData) scans all connections, making idle connections actively harmful
- Setting `max_connections` very high is counterproductive; use a connection pooler instead
- Connection establishment takes 10-30ms, making per-request connections expensive
- `pg_stat_activity` is your primary tool for monitoring connection state

In the next lesson, we'll see how connection poolers like PGDog solve these problems by multiplexing many client connections onto a small number of database connections.
