---
title: Connection Pooling and Management
description: Understand PostgreSQL connection architecture, connection poolers, and how to monitor and tune pooling parameters
estimatedMinutes: 50
---

# Connection Pooling and Management

Connection pooling is a critical technique for managing database connections efficiently in production environments. Understanding how PostgreSQL connections work and how to properly configure connection poolers can dramatically improve application performance and resource utilization.

## How PostgreSQL Connections Work

### Connection Architecture

PostgreSQL uses a process-per-connection model. Each client connection spawns a new backend process on the server.

**Connection lifecycle:**

1. **Client initiates connection** to PostgreSQL (typically port 5432)
2. **Postmaster (main process) receives request**
3. **New backend process forked** to handle this connection
4. **Authentication performed** (password, SSL, etc.)
5. **Connection established** - client can now execute queries
6. **Connection remains open** until client disconnects or timeout
7. **Backend process terminates** when connection closes

**Key point**: Each connection = one OS process with its own memory allocation.

### Cost of Connections

Creating a new PostgreSQL connection is expensive:

**Time cost:**
- Process forking: 1-5ms
- Memory allocation: Backend process memory (~10MB minimum)
- Authentication: SSL handshake, password verification (5-50ms)
- Total: 10-100ms per connection

**Resource cost:**
- Memory: Each connection uses 5-20MB+ (depends on `work_mem`, temp buffers)
- File descriptors: Each connection requires several FDs
- Context switching: More processes = more CPU overhead
- Connection limit: `max_connections` (default 100, typical 200-500)

**Example problem:**
```
Application with 100 web servers
Each server: 10 threads making DB requests
Total connections needed: 1,000

PostgreSQL max_connections: 200
Result: Connection exhaustion, application failures
```

### Connection Limit Configuration

```sql
-- Check current connection limit
SHOW max_connections;  -- Default: 100

-- Check how many connections are in use
SELECT COUNT(*) FROM pg_stat_activity;

-- Check connections by state
SELECT
    state,
    COUNT(*)
FROM pg_stat_activity
GROUP BY state;
```

**Common states:**
- `active` - Currently executing query
- `idle` - Connected but not running queries
- `idle in transaction` - Connection has open transaction (potentially problematic)
- `idle in transaction (aborted)` - Transaction failed, connection stuck

### The Connection Problem

**Without pooling:**
- Applications open/close connections frequently
- Each request creates new connection (expensive)
- Connections often sit idle between requests
- Limited by `max_connections`

**Example:**
```
Web request comes in
  → App creates DB connection (50ms overhead)
  → Executes query (5ms)
  → Closes connection
  → Total: 55ms (90% overhead!)
```

## What Connection Poolers Do

A connection pooler sits between application and database, managing a pool of persistent connections.

### Connection Pooler Architecture

```
[App 1] ─┐
[App 2] ─┼─→ [Connection Pooler] ─→ [PostgreSQL Server]
[App 3] ─┤    (maintains pool)        (fewer connections)
[App 4] ─┘
```

**Pooler maintains:**
- Pool of persistent connections to PostgreSQL
- Many client connections from applications
- Multiplexing: Reuses DB connections across clients

### Pooling Modes

#### 1. Session Pooling

**Behavior**: Client gets dedicated connection for entire session.

**Pros:**
- All PostgreSQL features work (prepared statements, temporary tables, SET variables)
- Application compatibility (no changes needed)
- Simple reasoning about state

**Cons:**
- Limited connection multiplexing
- Still subject to connection limits (just moved to pooler)

**Use case**: When applications expect session-level state.

#### 2. Transaction Pooling

**Behavior**: Connection assigned only for duration of transaction.

**Pros:**
- High connection reuse
- Supports many more clients than DB connections
- Better resource utilization

**Cons:**
- No prepared statements across transactions
- No temporary tables
- SET variable changes don't persist

**Use case**: Most web applications (request/response model).

**Example:**
```
Client 1: BEGIN → query → query → COMMIT (uses conn 1)
Client 2: BEGIN → query → COMMIT (reuses conn 1)
Client 3: SELECT (no transaction, reuses conn 1)
```

#### 3. Statement Pooling

**Behavior**: Connection returned to pool after each statement.

**Pros:**
- Maximum connection reuse
- Handles highest client load

**Cons:**
- No multi-statement transactions
- Very limited PostgreSQL feature support
- Most applications incompatible

**Use case**: Rare - only for very specific read-heavy workloads.

### Common Connection Poolers

**PgBouncer** (most popular):
- Lightweight (~2MB memory)
- Transaction and session pooling
- Simple configuration
- High performance

**Pgpool-II**:
- Connection pooling + load balancing + replication
- Query caching
- More features but more complex
- Higher resource usage

**Built-in application poolers**:
- HikariCP (Java)
- psycopg2 connection pools (Python)
- pg-pool (Node.js)

**Why external pooler > application pooler:**
- Pools connections across multiple app servers
- Central configuration and monitoring
- Survives app restarts
- Language-agnostic

## Monitoring Connection Pooling

### PostgreSQL Side: Connection Metrics

**Current connections:**
```sql
-- Total connections
SELECT COUNT(*) AS total_connections
FROM pg_stat_activity;

-- Connections by state
SELECT
    state,
    COUNT(*) AS count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM pg_stat_activity
GROUP BY state
ORDER BY count DESC;

-- Connections by database and user
SELECT
    datname,
    usename,
    COUNT(*) AS connections
FROM pg_stat_activity
WHERE datname IS NOT NULL
GROUP BY datname, usename
ORDER BY connections DESC;
```

**Idle connections:**
```sql
-- Connections idle for > 5 minutes
SELECT
    pid,
    usename,
    datname,
    application_name,
    client_addr,
    state,
    NOW() - state_change AS idle_duration
FROM pg_stat_activity
WHERE state = 'idle'
    AND NOW() - state_change > interval '5 minutes'
ORDER BY state_change;
```

**Idle in transaction (dangerous):**
```sql
-- Long-running idle transactions (blocking cleanup)
SELECT
    pid,
    usename,
    datname,
    NOW() - xact_start AS transaction_duration,
    NOW() - state_change AS idle_duration,
    query
FROM pg_stat_activity
WHERE state LIKE 'idle in transaction%'
    AND NOW() - state_change > interval '1 minute'
ORDER BY state_change;
```

These connections hold locks and prevent VACUUM from cleaning up dead rows!

### Connection Pooler Metrics

**PgBouncer stats** (example):
```sql
-- Connect to pgbouncer admin database
psql -p 6432 -U pgbouncer pgbouncer

-- Show pool status
SHOW POOLS;

-- Show client connections
SHOW CLIENTS;

-- Show server connections
SHOW SERVERS;

-- Show statistics
SHOW STATS;
```

**Key PgBouncer metrics:**
- `cl_active`: Active client connections
- `cl_waiting`: Clients waiting for connection
- `sv_active`: Server connections in use
- `sv_idle`: Server connections idle
- `sv_used`: Server connections ever used
- `maxwait`: Longest wait time for connection (in seconds)

**Warning signs:**
- `cl_waiting` > 0: Pool exhausted, clients waiting
- `maxwait` > 1: Clients waiting too long (pool too small)
- `sv_idle` = 0: Pool fully utilized (might need more connections)

## Tuning Connection Pooler Parameters

### PostgreSQL Configuration

**max_connections:**
```sql
-- Current setting
SHOW max_connections;  -- Typical: 100-500

-- Calculate appropriate value
-- Formula: (max expected concurrent queries) + (pooler connections) + buffer
-- Example: 100 active queries + 20 pooler conns + 10 buffer = 130
```

**Increasing max_connections:**
```
# postgresql.conf
max_connections = 200

# Requires restart
# Note: Increases shared memory requirements
```

**Warning**: Don't set too high (>500) without good reason. Each connection uses resources.

### Connection Pooler Configuration

**PgBouncer example** (`pgbouncer.ini`):

```ini
[databases]
mydb = host=localhost port=5432 dbname=mydb

[pgbouncer]
# How many server connections per user/database pair
default_pool_size = 20

# Max connections per pool
max_db_connections = 100

# Max client connections total
max_client_conn = 1000

# Pooling mode
pool_mode = transaction

# How long clients can wait for connection (seconds)
query_wait_timeout = 120

# Kill idle server connections after (seconds)
server_idle_timeout = 600

# Close server connection if idle in transaction (seconds)
server_lifetime = 3600
```

**Tuning pool_size:**

**Too small:**
- Clients wait for connections (`cl_waiting` > 0)
- High `maxwait` times
- Slow application performance

**Too large:**
- Wastes PostgreSQL connections
- No multiplexing benefit
- Could hit `max_connections`

**Formula:**
```
pool_size = (expected concurrent queries) / (number of poolers)

Example:
- 50 queries typically concurrent
- 1 pooler
- pool_size = 50

With transaction pooling and fast queries (10ms):
- 10 connections can handle 100 queries/sec
- pool_size = 10 might suffice
```

**Start conservative, monitor, adjust:**
1. Start with `pool_size = 20`
2. Monitor `cl_waiting` and `maxwait`
3. If clients wait, increase pool_size
4. If `sv_idle` always high, decrease pool_size

### Application-Side Configuration

**Connection timeout settings:**
```python
# Python example (psycopg2)
conn = psycopg2.connect(
    host='pgbouncer',
    port=6432,
    database='mydb',
    user='app_user',
    password='password',
    connect_timeout=5,          # Max time to establish connection
    options='-c statement_timeout=30000'  # Max query time (30s)
)
```

**Best practices:**
- Set connection timeout (don't wait forever)
- Set statement timeout (prevent runaway queries)
- Use application connection pool + pooler (two-tier pooling)
- Close connections promptly after use

### Two-Tier Pooling Strategy

**Application side** (per server):
- Small pool (10-20 connections)
- Handles bursts
- Connection reuse within app

**Pooler side** (centralized):
- Larger pool (50-200 connections)
- Handles aggregate load
- Connection reuse across apps

```
[App Server 1] → App Pool (10) ─┐
[App Server 2] → App Pool (10) ─┼→ PgBouncer (50) → PostgreSQL (50)
[App Server 3] → App Pool (10) ─┘
```

**Benefits:**
- App pool reduces connection churn to pooler
- Pooler multiplexes across all apps
- Total connections to DB: 50 (not 30 × N servers)

## Connection Pooling Best Practices

### 1. Always Use a Connection Pooler in Production

**Why:**
- Reduces connection overhead (90%+ reduction)
- Handles connection spikes
- Protects database from connection exhaustion
- Centralized connection management

**When to skip:**
- Development environments (single developer)
- Very low traffic sites (<10 req/min)

### 2. Choose Transaction Pooling When Possible

**Most web apps fit this model:**
- Request comes in
- Open transaction
- Run queries
- Commit and return response

**If you need session pooling:**
- You use prepared statements heavily
- You rely on temporary tables
- You need session variables

**Consider**: Refactor app to avoid session state if possible.

### 3. Monitor Pooler Metrics

**Set up alerts:**
- `cl_waiting` > 0 for 5+ seconds
- `maxwait` > 5 seconds
- Pool utilization > 80%

**Check dashboards:**
- Connection pool saturation
- Wait time trends
- Pool size efficiency

### 4. Right-Size Your Pools

**Avoid:**
- ❌ Setting pool_size = max_connections (defeats purpose)
- ❌ Setting pool_size too small (clients wait)
- ❌ Setting pool_size based on guesses

**Do:**
- ✅ Start with reasonable default (20-50)
- ✅ Monitor actual concurrency
- ✅ Tune based on `cl_waiting` and `sv_idle`
- ✅ Load test to find optimal size

### 5. Handle Idle in Transaction

**Problem:**
```sql
BEGIN;
SELECT * FROM users WHERE id = 1;
-- App bug: forgets to COMMIT
-- Connection stuck "idle in transaction"
```

**Solutions:**

**In PostgreSQL:**
```sql
-- Kill transactions idle for > 10 minutes
SET idle_in_transaction_session_timeout = '10min';
```

**In PgBouncer:**
```ini
# Close connections if idle in transaction > 30s
server_idle_timeout = 30
```

**In application:**
- Always use try/finally or context managers
- Automatic rollback on exceptions
- Set query timeouts

### 6. Optimize Query Performance First

**Connection pooling is not a substitute for query optimization.**

If queries take 5 seconds, pooling helps but:
- You still need large pools
- Connections still tied up
- Limited concurrency

**Fix slow queries first:**
1. Add indexes
2. Optimize query plans
3. Cache frequent queries
4. Then tune connection pools

### 7. Use Read Replicas for Read-Heavy Workloads

**Pattern:**
```
[App] → [Write Pooler] → [Primary DB]
      → [Read Pooler]  → [Replica 1]
                        → [Replica 2]
```

**Benefits:**
- Distribute read load
- Smaller connection pools per server
- Primary handles writes only

## Troubleshooting Connection Issues

### Problem: Clients Can't Connect (Connection Refused)

**Check:**
```sql
-- Are we at max_connections?
SELECT
    COUNT(*) AS current,
    current_setting('max_connections')::int AS max,
    current_setting('max_connections')::int - COUNT(*) AS available
FROM pg_stat_activity;
```

**If at limit:**
- Check for connection leaks (idle connections)
- Increase `max_connections` (requires restart)
- Add/tune connection pooler

### Problem: Slow Connection Establishment

**Symptoms**: Connection takes 5+ seconds

**Check:**
- SSL handshake time (disable SSL in dev to test)
- DNS resolution (use IP instead of hostname)
- Authentication method (md5 vs scram-sha-256)
- Network latency

**Solution**: Use connection pooler to amortize cost.

### Problem: Connections "Leak" (Don't Close)

**Check for idle connections:**
```sql
SELECT
    pid,
    usename,
    application_name,
    client_addr,
    NOW() - state_change AS duration
FROM pg_stat_activity
WHERE state = 'idle'
ORDER BY state_change;
```

**Solutions:**
- Fix application code (always close connections)
- Set `idle_session_timeout` in PostgreSQL 14+
- Use pooler with `server_idle_timeout`

### Problem: High Connection Churn

**Symptoms**: Constant connect/disconnect in logs

**Check:**
```sql
-- Monitor connection rate
SELECT
    datname,
    xact_commit + xact_rollback AS total_transactions,
    xact_commit,
    xact_rollback
FROM pg_stat_database
WHERE datname = 'mydb';
```

**Solution**: Add application-side connection pool.

## Key Takeaways

- **PostgreSQL connections are expensive**: Process-per-connection model has overhead
- **Connection poolers multiplex**: Many clients share fewer DB connections
- **Transaction pooling is ideal**: For most web applications
- **Monitor both sides**: PostgreSQL connections AND pooler metrics
- **Start conservative**: Default pool sizes, tune based on monitoring
- **Two-tier pooling**: App pool + central pooler for best efficiency
- **Fix queries first**: Pooling helps, but fast queries are essential
- **Watch for "idle in transaction"**: Kills performance and prevents VACUUM
- **Use external pooler in production**: PgBouncer or Pgpool-II

Connection pooling is essential for production PostgreSQL deployments. Properly configured pooling can support 10-100× more concurrent clients than direct connections, with dramatically better performance and resource utilization.
