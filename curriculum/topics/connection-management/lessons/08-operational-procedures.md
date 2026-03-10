---
title: Operational Procedures for Connection Management
description: Learn the day-to-day operational procedures for managing connections in production, including PGDog configuration reloads, graceful maintenance, and high availability patterns
estimatedMinutes: 35
---

# Operational Procedures for Connection Management

Running PostgreSQL with a connection pooler in production requires knowing a set of operational procedures: how to reload configuration without downtime, how to drain connections for maintenance, how to handle failovers, and how to check that everything is configured correctly. This lesson covers the practical runbook.

## Checking Connection-Related Settings

Before making changes, always check the current state. Here are the key PostgreSQL settings related to connections:

```sql
-- All connection-related settings in one query
SELECT name, setting, unit, short_desc
FROM pg_settings
WHERE name IN (
  'max_connections',
  'superuser_reserved_connections',
  'idle_in_transaction_session_timeout',
  'statement_timeout',
  'lock_timeout',
  'tcp_keepalives_idle',
  'tcp_keepalives_interval',
  'tcp_keepalives_count',
  'authentication_timeout',
  'client_connection_check_interval'
)
ORDER BY name;
```

Understanding each setting:

| Setting | Default | Purpose |
|---------|---------|---------|
| `max_connections` | 100 | Maximum concurrent connections |
| `superuser_reserved_connections` | 3 | Slots reserved for superusers |
| `idle_in_transaction_session_timeout` | 0 (off) | Kill idle-in-transaction sessions |
| `statement_timeout` | 0 (off) | Kill long-running queries |
| `lock_timeout` | 0 (off) | Give up waiting for locks |
| `tcp_keepalives_idle` | OS default | Detect dead TCP connections |
| `tcp_keepalives_interval` | OS default | Keepalive probe interval |
| `tcp_keepalives_count` | OS default | Keepalive probes before disconnect |
| `authentication_timeout` | 60s | Max time for authentication |
| `client_connection_check_interval` | 0 (off) | Check for disconnected clients during long queries |

### TCP Keepalives

TCP keepalives are important for detecting connections that have silently died (e.g., client crashed, network cable unplugged):

```sql
-- Recommended production settings
-- Detect dead connections within ~45 seconds
SHOW tcp_keepalives_idle;      -- Default varies by OS
SHOW tcp_keepalives_interval;  -- Default varies by OS
SHOW tcp_keepalives_count;     -- Default varies by OS
```

A good production configuration:

```sql
-- Start probing after 15 seconds of silence
ALTER SYSTEM SET tcp_keepalives_idle = 15;
-- Probe every 5 seconds
ALTER SYSTEM SET tcp_keepalives_interval = 5;
-- Give up after 3 failed probes (15 + 5*3 = 30 seconds to detect)
ALTER SYSTEM SET tcp_keepalives_count = 3;
```

Without keepalives, a dead connection can hold resources for hours until the OS TCP timeout fires (often 2+ hours).

## PGDog RELOAD: Applying Configuration Changes

PGDog can reload its configuration without dropping any client connections:

```sql
-- PGDog admin console (port 6433)
RELOAD;
```

What RELOAD does:
- Re-reads the `pgdog.toml` configuration file
- Applies changes to pool sizes, timeouts, and server lists
- Does **not** disconnect existing clients
- Does **not** destroy existing server connections (unless their configuration changed)

What you can change with RELOAD:
- Pool sizes (`default_pool_size`, `min_pool_size`)
- Timeouts (`checkout_timeout`, `client_idle_in_transaction_timeout`)
- Adding or removing servers (replicas)
- Authentication settings

What requires a full restart:
- Changing the listen address or port
- TLS certificate changes (in some poolers)

### Safe Configuration Change Workflow

```
1. Edit pgdog.toml
2. Connect to admin console: psql -p 6433
3. Run: RELOAD;
4. Verify: SHOW POOLS;  -- Check new settings are applied
5. Monitor for 5 minutes -- Ensure no errors
```

## PAUSE and RESUME: Draining Traffic

When you need to perform maintenance on PostgreSQL (upgrades, parameter changes requiring restart, etc.), you can use PGDog to gracefully drain traffic:

```sql
-- PGDog admin console
PAUSE mydb;
```

What PAUSE does:
1. Stops assigning new server connections to clients
2. Waits for active queries to complete
3. Returns all server connections to the pool
4. New client queries **wait** (they don't get errors)

The database is now safe for maintenance — no active connections, no in-flight queries.

After maintenance:

```sql
-- PGDog admin console
RESUME mydb;
```

What RESUME does:
1. Re-enables connection assignment
2. Waiting clients immediately get connections
3. Normal operation resumes

### PAUSE Timeout Considerations

If a query is running during PAUSE, PGDog waits for it to complete. If you need to force a pause:

- Set a short `statement_timeout` on PostgreSQL before pausing
- Or terminate long-running queries manually

## Graceful Shutdown

When shutting down PGDog for upgrades or server maintenance:

```sql
-- PGDog admin console
SHUTDOWN;
```

PGDog's shutdown behavior:

1. Stops accepting new client connections
2. Waits for active transactions to complete (up to `shutdown_timeout`)
3. Closes all server connections
4. Exits cleanly

The `shutdown_timeout` configuration determines how long PGDog waits for active transactions:

```toml
# PGDog configuration
shutdown_timeout = 30  # seconds
```

If transactions don't complete within the timeout, PGDog terminates them and exits.

## Terminating Idle Connections from PostgreSQL

Sometimes you need to clean up connections directly from PostgreSQL, bypassing the pooler:

### Terminating Specific Connections

```sql
-- Terminate a specific backend by PID
SELECT pg_terminate_backend(12345);

-- Terminate all idle-in-transaction sessions
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - xact_start > interval '5 minutes';
```

### Terminating All Connections to a Database

Useful before dropping a database or performing exclusive maintenance:

```sql
-- Terminate all connections to a specific database
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'mydb'
  AND pid != pg_backend_pid();  -- Don't terminate yourself!
```

### Cancel vs Terminate

```sql
-- pg_cancel_backend: sends SIGINT, cancels current query
-- The connection stays open, transaction rolls back
SELECT pg_cancel_backend(pid);

-- pg_terminate_backend: sends SIGTERM, kills the connection
-- The backend process exits completely
SELECT pg_terminate_backend(pid);
```

Use `pg_cancel_backend` first — it's gentler. If that doesn't work (e.g., the session is idle in transaction with no active query to cancel), use `pg_terminate_backend`.

## High Availability with Multiple Pooler Instances

PGDog is **stateless** — all state (connections, prepared statements) can be re-established. This means you can run multiple instances for high availability:

```
Load Balancer (HAProxy, NLB, etc.)
    │
    ├── PGDog Instance 1
    │
    └── PGDog Instance 2
            │
            └──→ PostgreSQL
```

Benefits:
- **Zero-downtime upgrades**: Drain one instance, upgrade it, bring it back, drain the other
- **Fault tolerance**: If one PGDog instance crashes, the load balancer routes to the other
- **Horizontal scaling**: Add more instances if the pooler becomes a bottleneck (rare with PGDog's multi-threaded architecture)

### Rolling Restart Procedure

```
1. Remove PGDog-1 from load balancer
2. Wait for active connections to drain (or PAUSE + SHUTDOWN)
3. Upgrade PGDog-1
4. Start PGDog-1 and verify health
5. Add PGDog-1 back to load balancer
6. Repeat steps 1-5 for PGDog-2
```

## Routine Operational Checks

### Daily Health Check

```sql
-- Run this query daily to assess connection health
SELECT
  (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend') AS total_connections,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS active,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') AS idle,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') AS idle_in_txn,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
  (SELECT setting FROM pg_settings WHERE name = 'idle_in_transaction_session_timeout') AS idle_txn_timeout,
  (SELECT setting FROM pg_settings WHERE name = 'statement_timeout') AS stmt_timeout;
```

### After-Incident Checklist

After any connection-related incident:

1. **Check the current state**: Run the health check query above
2. **Review what happened**: Check `pg_stat_activity` for unusual patterns
3. **Clean up**: Terminate any remaining problematic sessions
4. **Verify timeouts**: Ensure `idle_in_transaction_session_timeout` and `statement_timeout` are set
5. **Check PGDog**: `SHOW POOLS` to verify pool health, `SHOW STATS` for error counts
6. **Document**: Record what happened and what was done

### Capacity Planning

Monitor these trends weekly:

```sql
-- Peak connection usage over time
-- (Run this query and record the results periodically)
SELECT
  now() AS checked_at,
  count(*) AS total_connections,
  count(*) FILTER (WHERE state = 'active') AS peak_active,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_allowed,
  round(100.0 * count(*) / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 1) AS utilization_pct
FROM pg_stat_activity
WHERE backend_type = 'client backend';
```

If utilization consistently exceeds 70%, it's time to either:
- Increase pool size (if PostgreSQL has headroom)
- Optimize query performance (reduce connection hold time)
- Add read replicas (if reads dominate)

## Summary of Key Procedures

| Procedure | Command | When to Use |
|-----------|---------|------------|
| Check settings | `SELECT FROM pg_settings` | Before any changes |
| Reload PGDog | `RELOAD` (admin) | After config changes |
| Drain traffic | `PAUSE db` (admin) | Before PostgreSQL maintenance |
| Resume traffic | `RESUME db` (admin) | After maintenance |
| Shut down PGDog | `SHUTDOWN` (admin) | PGDog upgrades |
| Kill idle transactions | `pg_terminate_backend(pid)` | Pool exhaustion recovery |
| Kill all DB connections | `pg_terminate_backend()` loop | Before DROP DATABASE |
| Check health | State summary query | Daily monitoring |

## Summary

- Always check current settings before making changes (`pg_settings` query)
- PGDog `RELOAD` applies configuration changes without dropping clients
- `PAUSE`/`RESUME` provide graceful traffic draining for PostgreSQL maintenance
- TCP keepalives detect dead connections; configure them explicitly in production
- `pg_terminate_backend()` is your tool for cleaning up stuck connections
- Run multiple PGDog instances behind a load balancer for high availability
- Establish routine health checks and post-incident procedures

Congratulations! You've completed the Connection Management and PGDog topic. You now understand PostgreSQL's process model, how connection poolers solve the scaling problem, the nuances of transaction pooling, and the operational procedures for running connections in production.
