---
title: Transaction Pooling Mode
description: Master the constraints and patterns of transaction-mode pooling, where server connections are shared between transactions rather than sessions
estimatedMinutes: 40
---

# Transaction Pooling Mode

Transaction pooling is the most common and most efficient pooling mode. It assigns a server connection to a client only for the duration of a transaction, then returns it to the pool. This means a pool of 10 server connections can serve hundreds of clients — as long as they're not all running transactions simultaneously.

## Pooling Modes Explained

Connection poolers typically offer multiple modes:

### Session Mode

The server connection is assigned when the client connects and released when the client disconnects. This is the most compatible mode — everything works exactly as it would with a direct connection — but it provides the least multiplexing benefit.

```
Client connects    → Gets server connection
(entire session)   → Same server connection
Client disconnects → Server connection released
```

### Transaction Mode

The server connection is assigned when a transaction begins and released when it commits or rolls back. Between transactions, the client has no server connection.

```
BEGIN              → Gets server connection
(queries...)       → Same server connection
COMMIT/ROLLBACK    → Server connection released
(idle)             → No server connection held
```

For single-statement auto-commit queries (no explicit `BEGIN`), the server connection is borrowed for just that one statement.

### Statement Mode

The server connection is assigned for each individual statement. This provides maximum multiplexing but breaks multi-statement transactions entirely. It's rarely used in practice.

## Why Transaction Mode Is Preferred

Transaction mode provides the best balance of efficiency and compatibility:

- **High multiplexing**: Server connections are only held during active transactions, typically milliseconds
- **Multi-statement transactions work**: `BEGIN ... COMMIT` blocks execute correctly
- **Most applications are compatible**: With some adjustments (covered below)

The key insight: most applications spend the vast majority of their time between transactions — waiting for user input, processing business logic, or handling network I/O. During all that time, the server connection can serve other clients.

## What Breaks in Transaction Mode

When the server connection changes between transactions, certain PostgreSQL features stop working as expected:

### 1. Session-Level SET Commands

```sql
-- This WILL NOT persist across transactions in transaction mode!
SET work_mem = '256MB';
SELECT * FROM large_table;  -- Uses 256MB work_mem
-- Transaction ends, connection returns to pool
SELECT * FROM another_table;  -- Might get a different connection!
                               -- work_mem is back to default
```

Session-level `SET` modifies the connection's state. In transaction mode, you might get a different connection for your next transaction, losing the setting.

**Solution**: Use `SET LOCAL` inside an explicit transaction:

```sql
BEGIN;
SET LOCAL work_mem = '256MB';  -- Only affects THIS transaction
-- ... your queries ...
COMMIT;
-- Setting automatically reverts, no state leaks
```

`SET LOCAL` is actually the better practice even without a pooler — it scopes the change precisely and prevents accidental state leakage.

### 2. Temporary Tables

```sql
CREATE TEMP TABLE my_temp (id INT);
INSERT INTO my_temp VALUES (1), (2), (3);
-- Transaction ends, connection returns to pool

SELECT * FROM my_temp;  -- ERROR: relation "my_temp" does not exist
```

Temporary tables are tied to the session (the server connection). When the pooler assigns a different server connection for the next transaction, the temp table doesn't exist there.

**Solution**: Create and use temporary tables within a single transaction:

```sql
BEGIN;
CREATE TEMP TABLE my_temp (id INT) ON COMMIT DROP;
INSERT INTO my_temp VALUES (1), (2), (3);
SELECT * FROM my_temp;  -- Works fine
COMMIT;  -- Temp table is dropped
```

The `ON COMMIT DROP` clause explicitly drops the temp table when the transaction ends.

### 3. LISTEN/NOTIFY

PostgreSQL's pub/sub mechanism requires a persistent connection to receive notifications:

```sql
LISTEN my_channel;
-- In transaction mode, you won't reliably receive notifications
-- because the server connection changes between transactions
```

**Solution**: Use session mode for connections that need LISTEN/NOTIFY, or use an external message queue.

### 4. Prepared Statements (Traditional Poolers)

With traditional poolers like PgBouncer, prepared statements are problematic:

```sql
PREPARE my_query(int) AS SELECT * FROM users WHERE id = $1;
-- Transaction ends, connection returns to pool

EXECUTE my_query(42);  -- ERROR: prepared statement "my_query" does not exist
```

Prepared statements exist on the server connection. A different connection won't have them.

**PGDog's Solution**: PGDog maintains a **global prepared statement cache**. When a client prepares a statement, PGDog:
1. Parses the `PREPARE` command
2. Stores it in a shared cache
3. When a client tries to `EXECUTE` on a connection that doesn't have the statement, PGDog transparently re-prepares it

This means prepared statements work seamlessly in transaction mode with PGDog — a significant advantage over older poolers.

## The SET LOCAL Pattern in Detail

Since `SET LOCAL` is the correct approach for configuration changes in a pooled environment, let's explore it thoroughly:

```sql
-- Check default work_mem
SHOW work_mem;  -- '4MB' (default)

-- Modify it within a transaction scope
BEGIN;
SET LOCAL work_mem = '256MB';
SHOW work_mem;  -- '256MB' — changed within this transaction

-- Run a memory-intensive query
SELECT * FROM large_table ORDER BY some_column;

COMMIT;

-- Verify it reverted
SHOW work_mem;  -- '4MB' — back to default
```

This pattern works correctly with any pooling mode because the setting is explicitly scoped to the transaction. It never leaks to other clients.

### Common SET LOCAL Use Cases

```sql
-- Temporarily increase sort memory for a big report
BEGIN;
SET LOCAL work_mem = '512MB';
SELECT ... FROM ... ORDER BY ... GROUP BY ...;
COMMIT;

-- Temporarily change search_path for a specific operation
BEGIN;
SET LOCAL search_path TO myschema, public;
SELECT * FROM my_table;  -- Finds my_table in myschema
COMMIT;

-- Temporarily increase statement timeout for a migration
BEGIN;
SET LOCAL statement_timeout = '5min';
ALTER TABLE large_table ADD COLUMN new_col INT DEFAULT 0;
COMMIT;
```

## SET vs SET LOCAL: A Comparison

```sql
-- Session SET: persists until connection closes (or is reset)
SET work_mem = '256MB';
-- Dangerous with pooling: leaks to other clients

-- Transaction SET LOCAL: reverts after transaction
BEGIN;
SET LOCAL work_mem = '256MB';
-- Safe with pooling: scoped to this transaction
COMMIT;
-- work_mem is back to default

-- RESET: explicitly reverts a session SET
SET work_mem = '256MB';
RESET work_mem;  -- Back to default
-- Works, but SET LOCAL is cleaner
```

## Connection State and the DISCARD Command

When a pooler returns a connection to the pool, it needs to clean up any session state the previous client may have left behind. This is done with:

```sql
-- Reset all session state
DISCARD ALL;
```

`DISCARD ALL` is equivalent to running:
- `RESET ALL` (revert all SET parameters)
- `DEALLOCATE ALL` (remove prepared statements)
- `CLOSE ALL` (close cursors)
- `UNLISTEN *` (stop listening for notifications)
- `SELECT pg_advisory_unlock_all()` (release advisory locks)
- `DISCARD PLANS` (invalidate cached plans)
- `DISCARD SEQUENCES` (reset sequence caches)
- `DISCARD TEMP` (drop temporary tables)

PGDog and PgBouncer can be configured to run `DISCARD ALL` (or a subset) when releasing a connection back to the pool, ensuring a clean state for the next client. PGDog calls this `server_reset_query`:

```toml
# In PGDog configuration
server_reset_query = "DISCARD ALL"
```

## Detecting Transaction Mode Issues

If you suspect a pooler-related issue, look for these symptoms:

1. **Settings mysteriously changing**: A `SET` command seems to have no effect on subsequent queries
2. **"Relation does not exist" for temp tables**: Temp tables vanish between queries
3. **"Prepared statement does not exist"**: With poolers that don't cache prepared statements
4. **Advisory lock loss**: Advisory locks disappear between transactions

A quick diagnostic query:

```sql
-- Check if your connection's backend PID changes between transactions
-- If using a pooler in transaction mode, the PID may change
SELECT pg_backend_pid();
-- Run some other queries
SELECT pg_backend_pid();
-- If the PID changed, you're on a different server connection
```

## Best Practices for Transaction Mode

1. **Always use `SET LOCAL` instead of `SET`** for configuration changes
2. **Keep transactions short** — long transactions hold server connections
3. **Use `ON COMMIT DROP` for temp tables** if you must use them
4. **Avoid LISTEN/NOTIFY** through pooled connections
5. **Don't rely on session state** between transactions
6. **Use PGDog** if you need prepared statement support in transaction mode

## Summary

- Transaction mode pools server connections between transactions, providing the best multiplexing
- Session-level `SET`, temporary tables, LISTEN/NOTIFY, and (with some poolers) prepared statements don't work across transactions
- `SET LOCAL` within a `BEGIN/COMMIT` block is the correct pattern for configuration changes in pooled environments
- PGDog's global prepared statement cache solves the prepared statement problem that plagues other poolers
- `DISCARD ALL` cleans up connection state when returning connections to the pool
- When in doubt, assume your next query might run on a different server connection

Next, we'll look at what happens when all server connections are busy — pool exhaustion.
