---
title: Connection Multiplexing and Pooler Architecture
description: Understand how connection poolers like PGDog multiplex many client connections onto a small pool of server connections, and compare the major pooler options
estimatedMinutes: 40
---

# Connection Multiplexing and Pooler Architecture

In the previous lesson, we saw that PostgreSQL's process-per-connection model doesn't scale well beyond a few hundred connections. Connection poolers solve this by sitting between your application and PostgreSQL, maintaining a small pool of database connections and sharing them among a much larger number of application clients.

## The Fundamental Problem

Consider a typical web application:

- **100 application servers** running your code
- Each server maintains a **connection pool of 20** database connections
- That's **2,000 PostgreSQL backend processes**

But at any given moment, only a fraction of those connections are actually executing queries. Most are idle, waiting for the next HTTP request to arrive. You're paying the full memory and snapshot cost for 2,000 connections when maybe 50-100 would suffice.

## How Connection Multiplexing Works

A connection pooler acts as a proxy between your application and PostgreSQL:

```
Application Servers (2,000 client connections)
        │
        ▼
   ┌─────────────┐
   │  Connection  │
   │   Pooler     │  ← Maintains a small pool
   │  (e.g. PGDog)│     of server connections
   └─────────────┘
        │
        ▼
PostgreSQL (50 server connections)
```

The pooler:
1. Accepts incoming connections from applications (these are **client connections**)
2. Maintains a fixed-size pool of connections to PostgreSQL (these are **server connections**)
3. When a client needs to execute a query, the pooler assigns it an available server connection
4. When the client is done (definition varies by pooling mode), the server connection returns to the pool

This means 2,000 application connections can share 50 database connections, reducing PostgreSQL's overhead by 40x.

## PGDog: A Modern Connection Pooler

**PGDog** is a Rust-based connection pooler built on Tokio (an async runtime). Its key architectural features:

- **Multi-threaded**: Unlike PgBouncer (single-threaded), PGDog uses all available CPU cores
- **Wire protocol proxy**: Speaks the PostgreSQL wire protocol natively
- **Parser-based routing**: Can parse SQL to route reads to replicas and writes to the primary
- **Global prepared statement cache**: Solves the prepared statement problem in transaction pooling mode

### PGDog Configuration Basics

PGDog is configured via a TOML file. The critical settings:

```toml
[general]
host = "0.0.0.0"
port = 6432                    # Client-facing port
admin_port = 6433              # Admin console port

[pools.default]
default_pool_size = 10         # Server connections per pool
min_pool_size = 2              # Minimum idle server connections
pool_mode = "transaction"      # Key setting: transaction vs session

[pools.default.users.0]
username = "app"
password = "secret"

[pools.default.shards.0.servers.0]
host = "postgres-primary"
port = 5432
role = "primary"
```

The `default_pool_size` is the most important tuning parameter — it controls how many actual PostgreSQL connections the pooler maintains. A pool of 10-30 server connections can typically handle hundreds of client connections.

## Client Connections vs Server Connections

Understanding this distinction is critical:

**Client connections**: Connections from your application to the pooler. These are cheap — PGDog handles them with async I/O, using minimal memory per connection. You can have thousands.

**Server connections**: Connections from the pooler to PostgreSQL. Each one is a real PostgreSQL backend process with its full memory overhead. You want to keep these low.

```sql
-- On the PostgreSQL side, you only see server connections
-- (the connections from PGDog to PostgreSQL)
SELECT count(*) AS server_connections
FROM pg_stat_activity
WHERE backend_type = 'client backend';
```

When querying `pg_stat_activity` from PostgreSQL's perspective, you see the pooler's server connections, not the individual application clients. The pooler's admin console shows you the client-side view.

## SHOW POOLS: Understanding Pool State

PGDog (and PgBouncer) provide an admin console where you can inspect pool state. When connected to the admin port:

```sql
-- PGDog admin console (port 6433)
SHOW POOLS;
```

This returns columns like:

| Column | Meaning |
|--------|---------|
| `database` | Target database name |
| `user` | Username for this pool |
| `cl_active` | Client connections currently executing queries |
| `cl_waiting` | Client connections waiting for a server connection |
| `sv_active` | Server connections currently handling a query |
| `sv_idle` | Server connections available in the pool |
| `sv_used` | Server connections recently used (returned to pool) |
| `pool_mode` | Pooling mode (transaction/session) |
| `maxwait` | Longest time (seconds) a client has been waiting |

The most important metric: **`cl_waiting`**. If clients are waiting, your pool is too small (or some connections are stuck).

## Pooler Comparison

When choosing a connection pooler, you have three main options. Here's how they compare:

| Feature | PGDog | PgBouncer | Pgpool-II |
|---------|-------|-----------|-----------|
| **Language** | Rust (multi-threaded) | C (single-threaded) | C (multi-process) |
| **Pooling modes** | Transaction, session | Statement, transaction, session | Session |
| **Read/write splitting** | Yes (parser-based) | No | Yes (basic) |
| **Prepared statements (tx mode)** | Yes (global cache) | Partial (since v1.22) | Yes |
| **Load balancing** | Yes (built-in) | No | Yes |
| **Connection queueing** | Yes | Yes | Yes |
| **Admin console** | Yes (SQL-based) | Yes (SQL-based) | Yes (PCP) |
| **Protocol support** | PostgreSQL v3 | PostgreSQL v3 | PostgreSQL v3 |
| **Max throughput** | Very high (multi-core) | High (single-core) | Medium |
| **Memory per client** | Very low (async) | Very low | Higher (per-process) |
| **Configuration** | TOML | INI | Custom |
| **Maturity** | Newer | Very mature | Very mature |

### When to Choose Which

**PGDog**: Best for modern deployments that need read/write splitting, high throughput, and prepared statement support in transaction mode. Its multi-threaded architecture makes better use of modern hardware.

**PgBouncer**: The battle-tested default. If you don't need read/write splitting and your workload fits on a single core, PgBouncer is simple and reliable. It's the most widely deployed pooler.

**Pgpool-II**: When you need built-in replication management and load balancing in a single tool. However, its session-only pooling mode is limiting, and its complexity can be a burden.

## Connection Pooler Placement

There are two common deployment patterns:

### Sidecar Pattern

The pooler runs on the same host as PostgreSQL:

```
App Server → Network → [PGDog + PostgreSQL] (same host)
```

**Pros**: No extra network hop between pooler and database
**Cons**: Pooler consumes resources on the database host

### Proxy Pattern

The pooler runs on a separate host (or on each application server):

```
[App Server + PGDog] → Network → PostgreSQL
```

**Pros**: Reduces load on the database host; can run multiple pooler instances
**Cons**: Extra network hop if pooler is on a separate host

For most deployments, running a single PGDog instance close to PostgreSQL (same host or same network zone) works well. For high availability, run multiple PGDog instances behind a load balancer — PGDog is stateless (all state lives in PostgreSQL), so this is straightforward.

## Sizing Your Pool

A common question: how many server connections should the pool maintain?

The optimal number depends on your hardware, but a good starting point is:

```
pool_size = (number of CPU cores * 2) + number of disk spindles
```

For a typical cloud instance with 4 vCPUs and SSD storage:
- Start with **10-15** server connections
- Monitor `cl_waiting` — if it's consistently > 0, increase the pool
- Monitor PostgreSQL CPU — if it's near 100%, more connections won't help

Larger pools don't always mean better performance. Beyond a certain point, more concurrent connections cause more lock contention and context switching, reducing throughput.

## Verifying Pool Behavior

Even without a pooler running, you can observe the connection concepts using `pg_stat_activity`:

```sql
-- How many backend connections exist right now?
SELECT count(*) AS total_backends
FROM pg_stat_activity
WHERE backend_type = 'client backend';

-- What's the maximum allowed?
SHOW max_connections;
```

The ratio of active backends to `max_connections` tells you how much headroom you have. In a pooled environment, this ratio should stay low and stable, since the pooler maintains a fixed number of server connections regardless of how many clients connect.

## Summary

- Connection poolers multiplex many client connections onto a small number of server connections
- PGDog is a modern, multi-threaded Rust pooler with SQL parsing, read/write splitting, and global prepared statement caching
- The key distinction is between client connections (cheap, handled by the pooler) and server connections (expensive, real PostgreSQL backends)
- `SHOW POOLS` on the admin console reveals pool health; `cl_waiting > 0` means your pool is undersized
- PGDog, PgBouncer, and Pgpool-II each have different strengths — choose based on your requirements
- Pool size should match your hardware capacity, not your client count

Next, we'll dive into transaction pooling mode — the most common and most nuanced pooling mode.
