---
title: Prepared Statements Fundamentals
description: Learn how to use prepared statements for performance and security
estimatedMinutes: 45
---

# Prepared Statements Fundamentals

Prepared statements are a powerful feature that provides both performance benefits (through query plan caching) and security benefits (through SQL injection prevention). Understanding when and how to use them is crucial for building efficient, secure database applications.

## What Are Prepared Statements?

A prepared statement is a pre-parsed, pre-planned SQL query template with placeholders for parameters.

**Traditional query** (executed each time):
```sql
SELECT * FROM users WHERE email = 'alice@example.com';
SELECT * FROM users WHERE email = 'bob@example.com';
-- Each query is parsed and planned separately
```

**Prepared statement** (prepared once, executed many times):
```sql
PREPARE get_user_by_email (text) AS
    SELECT * FROM users WHERE email = $1;

EXECUTE get_user_by_email('alice@example.com');
EXECUTE get_user_by_email('bob@example.com');
-- Query is parsed and planned once, parameters substituted during execution
```

## How Prepared Statements Work

### The Query Execution Lifecycle

**Without prepared statements**:
```
1. Parse SQL text       → Parse tree
2. Analyze/Rewrite      → Query tree
3. Plan                 → Execution plan
4. Execute              → Results
```

This happens **every time** you run the query.

**With prepared statements**:
```
PREPARE:
1. Parse SQL text       → Parse tree
2. Analyze/Rewrite      → Query tree
3. (Sometimes) Plan     → Execution plan

EXECUTE (first 5 times):
1. Plan with parameters → Custom plan
2. Execute              → Results

EXECUTE (6th time onwards, if beneficial):
1. Use generic plan     → Generic plan (cached)
2. Execute              → Results
```

Steps 1-3 happen **once** during PREPARE. Subsequent EXECUTEs skip directly to execution (or use a cached generic plan).

## Creating Prepared Statements

### SQL Syntax

```sql
PREPARE statement_name (parameter_types) AS
    SELECT/INSERT/UPDATE/DELETE statement;
```

**Example: Simple SELECT**
```sql
PREPARE get_user (int) AS
    SELECT id, name, email FROM users WHERE id = $1;

EXECUTE get_user(42);
```

**Example: Multiple Parameters**
```sql
PREPARE find_orders (int, date, date) AS
    SELECT * FROM orders
    WHERE user_id = $1
        AND created_at BETWEEN $2 AND $3
    ORDER BY created_at DESC;

EXECUTE find_orders(123, '2024-01-01', '2024-01-31');
```

**Example: INSERT**
```sql
PREPARE insert_user (text, text, text) AS
    INSERT INTO users (name, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id;

EXECUTE insert_user('Alice', 'alice@example.com', 'hash123');
```

**Example: UPDATE**
```sql
PREPARE update_last_login (int, timestamp) AS
    UPDATE users SET last_login = $2 WHERE id = $1;

EXECUTE update_last_login(42, NOW());
```

### Parameter Placeholders

Parameters are referenced as `$1`, `$2`, `$3`, etc.

```sql
PREPARE complex_query (int, text, boolean, date) AS
    SELECT *
    FROM orders o
        JOIN users u ON o.user_id = u.id
    WHERE o.id > $1
        AND u.name ILIKE $2
        AND o.is_paid = $3
        AND o.created_at > $4;

EXECUTE complex_query(1000, '%smith%', true, '2024-01-01');
```

**Type matching**: PostgreSQL will attempt to cast parameters to the declared type, but explicit types are better for clarity.

### Listing and Dropping Prepared Statements

```sql
-- View current session's prepared statements
SELECT name, statement, parameter_types
FROM pg_prepared_statements;

-- Drop a prepared statement
DEALLOCATE get_user;

-- Drop all prepared statements
DEALLOCATE ALL;
```

## Security Benefits: SQL Injection Prevention

### The SQL Injection Problem

**Vulnerable code** (string concatenation):
```python
# Python example - VULNERABLE!
email = request.get('email')
query = f"SELECT * FROM users WHERE email = '{email}'"
cursor.execute(query)
```

**Attack**:
```
email = "' OR '1'='1"
Result: SELECT * FROM users WHERE email = '' OR '1'='1'
Returns all users!
```

```
email = "'; DROP TABLE users; --"
Result: SELECT * FROM users WHERE email = ''; DROP TABLE users; --'
Deletes your users table!
```

### Prepared Statements Prevent Injection

```python
# Python example - SAFE!
email = request.get('email')
cursor.execute("SELECT * FROM users WHERE email = $1", (email,))
```

Even if `email = "'; DROP TABLE users; --"`, the database treats it as a **literal string value**, not SQL code.

**Result**:
```sql
SELECT * FROM users WHERE email = '''; DROP TABLE users; --'
-- Looks for user with that exact email (won't find one)
-- No SQL injection!
```

### Why This Works

With prepared statements:
1. **SQL structure is defined at PREPARE time**
2. **Parameters are data, not code**
3. **PostgreSQL knows parameters are values, not SQL**

The parser has already built the query tree, so parameters can't change the structure.

## Performance Benefits: Query Plan Caching

### Custom Plans vs Generic Plans

PostgreSQL uses a sophisticated strategy:

**First 5 executions**: Create a **custom plan** for each execution's specific parameter values.

```sql
PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

-- Execution 1: user_id = 123 (100 orders)
-- Custom plan: Index Scan (good for 100 rows)

-- Execution 2: user_id = 456 (1,000,000 orders)
-- Custom plan: Seq Scan (good for 1M rows)
```

Each custom plan is optimized for that specific parameter value.

**After 5 executions**: PostgreSQL compares the **average cost of custom plans** vs. the **cost of a generic plan** (planned without knowing parameter values).

If generic plan is comparable, PostgreSQL switches to it and caches it.

### Why Generic Plans Matter

**Benefits**:
- **Planning time eliminated** (only execute, no plan)
- Consistent predictable performance
- Less CPU overhead on each execution

**Trade-offs**:
- May not be as optimal as custom plan for specific values
- Can be worse if data distribution is skewed

### Viewing Plan Choice

```sql
PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

-- Execute 6 times
EXECUTE get_orders(123);
EXECUTE get_orders(456);
EXECUTE get_orders(789);
EXECUTE get_orders(234);
EXECUTE get_orders(567);
EXECUTE get_orders(890);

-- Check if using generic plan
SELECT name, generic_plans, custom_plans
FROM pg_prepared_statements
WHERE name = 'get_orders';
```

**Output**:
```
    name     | generic_plans | custom_plans
-------------+---------------+--------------
 get_orders  |             1 |            5
```

After 6th execution, it switched to a generic plan.

### Forcing Custom Plans

Sometimes you want custom plans always (e.g., highly skewed data):

```sql
-- Option 1: Use PREPARE + EXECUTE explicitly in a transaction
BEGIN;
PREPARE temp_plan (int) AS SELECT * FROM orders WHERE user_id = $1;
EXECUTE temp_plan(123);
COMMIT;
-- Plan is discarded after transaction
```

```sql
-- Option 2: Set plan_cache_mode
SET plan_cache_mode = 'force_custom_plan';

PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

EXECUTE get_orders(123);
-- Always uses custom plan
```

**Options**:
- `auto` (default): Automatically choose
- `force_generic_plan`: Always use generic plan
- `force_custom_plan`: Always use custom plan

### When to Force Custom Plans

**Use case**: Data is skewed

```sql
-- Table: orders (10M rows)
-- user_id = 1 has 5M orders (VIP customer)
-- Most users have < 100 orders

PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;
```

**Generic plan**: Might choose Seq Scan (since user 1 has 50% of data)
**Custom plan for user 1**: Seq Scan (correct)
**Custom plan for user 1234**: Index Scan (correct)

With skewed data, force custom plans:
```sql
SET plan_cache_mode = 'force_custom_plan';
```

## Application-Level Prepared Statements

Most applications don't use SQL-level PREPARE/EXECUTE directly. Instead, they use driver-level prepared statements.

### Python (psycopg2)

```python
import psycopg2

conn = psycopg2.connect("dbname=mydb")
cursor = conn.cursor()

# Prepared statement (automatic)
cursor.execute(
    "SELECT * FROM users WHERE email = %s",
    ('alice@example.com',)
)

# Multiple executions reuse the plan
cursor.execute(
    "SELECT * FROM users WHERE email = %s",
    ('bob@example.com',)
)
```

**Note**: `%s` is psycopg2's placeholder syntax (converted to `$1`, `$2`, etc.).

### Node.js (node-postgres)

```javascript
const { Client } = require('pg');
const client = new Client();

await client.connect();

// Parameterized query
const result = await client.query(
    'SELECT * FROM users WHERE email = $1',
    ['alice@example.com']
);

// Explicit prepared statement
const prepared = {
    name: 'get-user-by-email',
    text: 'SELECT * FROM users WHERE email = $1',
    values: ['alice@example.com']
};
await client.query(prepared);
```

### Java (JDBC)

```java
String sql = "SELECT * FROM users WHERE email = ?";
PreparedStatement pstmt = connection.prepareStatement(sql);

pstmt.setString(1, "alice@example.com");
ResultSet rs = pstmt.executeQuery();

// Reuse with different parameters
pstmt.setString(1, "bob@example.com");
ResultSet rs2 = pstmt.executeQuery();
```

### Ruby (pg gem)

```ruby
require 'pg'

conn = PG.connect(dbname: 'mydb')

# Parameterized query
conn.exec_params(
    'SELECT * FROM users WHERE email = $1',
    ['alice@example.com']
)

# Prepared statement
conn.prepare('get_user', 'SELECT * FROM users WHERE email = $1')
conn.exec_prepared('get_user', ['alice@example.com'])
conn.exec_prepared('get_user', ['bob@example.com'])
```

## Performance Comparison

### Benchmark: With vs Without Prepared Statements

```sql
-- Without prepared statements (1000 executions)
DO $$
DECLARE
    i int;
    start_time timestamp;
    end_time timestamp;
BEGIN
    start_time := clock_timestamp();
    FOR i IN 1..1000 LOOP
        PERFORM * FROM users WHERE id = i;
    END LOOP;
    end_time := clock_timestamp();
    RAISE NOTICE 'Time: %ms', EXTRACT(MILLISECONDS FROM (end_time - start_time));
END$$;
```

**Result**: ~450ms (parsing + planning + execution each time)

```sql
-- With prepared statements (1000 executions)
PREPARE get_user_by_id (int) AS
    SELECT * FROM users WHERE id = $1;

DO $$
DECLARE
    i int;
    start_time timestamp;
    end_time timestamp;
BEGIN
    start_time := clock_timestamp();
    FOR i IN 1..1000 LOOP
        EXECUTE get_user_by_id(i);
    END LOOP;
    end_time := clock_timestamp();
    RAISE NOTICE 'Time: %ms', EXTRACT(MILLISECONDS FROM (end_time - start_time));
END$$;
```

**Result**: ~280ms (parsing + planning once, execution 1000 times)

**Improvement**: ~38% faster

### Planning Time Savings

```sql
-- Check planning time
EXPLAIN (ANALYZE, TIMING ON)
SELECT * FROM users WHERE email = 'alice@example.com';
```

**Output**:
```
Planning Time: 0.158 ms
Execution Time: 0.042 ms
```

For simple queries, **planning can take 3-4× longer than execution**!

With prepared statements, you pay this cost once, not every execution.

## When NOT to Use Prepared Statements

### 1. One-Time Administrative Queries

```sql
-- No benefit, adds complexity
PREPARE drop_index (text) AS
    DROP INDEX $1;  -- Can't parameterize identifier!

-- Just use:
DROP INDEX old_unused_index;
```

**Identifiers (table names, column names) cannot be parameterized**.

### 2. Dynamically Constructed Queries

```sql
-- Can't prepare this
filters = ['status = active', 'created_at > 2024-01-01']
query = f"SELECT * FROM orders WHERE {' AND '.join(filters)}"
```

Prepared statements require fixed SQL structure. For dynamic queries, carefully validate and escape inputs.

### 3. Queries with Skewed Data (Sometimes)

If query performance heavily depends on parameter values:

```sql
-- user_id = 1 has 1M rows (needs Seq Scan)
-- Most users have 10 rows (needs Index Scan)

-- Generic plan might choose Index Scan (good for most)
-- But terrible for user_id = 1
```

Solution: Use `plan_cache_mode = 'force_custom_plan'` or avoid prepared statements.

### 4. Reporting/BI Queries

Ad-hoc analytical queries benefit less:
- Run infrequently (no reuse)
- Planning cost amortized over long execution time
- Often want custom plan for specific filters

## Best Practices

### 1. Always Use Parameterization for User Input

```python
# GOOD
cursor.execute("SELECT * FROM users WHERE email = $1", (user_email,))

# BAD
cursor.execute(f"SELECT * FROM users WHERE email = '{user_email}'")
```

Even if you don't explicitly prepare, use parameterized queries.

### 2. Reuse Prepared Statements Within a Session

```python
# Prepare once
cursor.execute("PREPARE get_user (text) AS SELECT * FROM users WHERE email = $1")

# Execute many times
for email in emails:
    cursor.execute("EXECUTE get_user(%s)", (email,))
```

### 3. Name Prepared Statements Descriptively

```sql
-- GOOD
PREPARE get_active_orders_by_user (int, date) AS ...

-- BAD
PREPARE stmt1 (int, date) AS ...
```

### 4. Monitor Prepared Statement Usage

```sql
SELECT
    name,
    statement,
    prepare_time,
    calls,
    total_exec_time / calls AS avg_exec_time_ms,
    generic_plans,
    custom_plans
FROM pg_prepared_statements
ORDER BY calls DESC;
```

### 5. Clean Up Unused Prepared Statements

Prepared statements persist for the session lifetime:

```sql
-- At session end or periodically
DEALLOCATE ALL;
```

Connection pools should reset connections or deallocate between uses.

### 6. Use Explicit Types for Complex Parameters

```sql
-- GOOD
PREPARE find_recent (int, timestamp) AS
    SELECT * FROM logs WHERE user_id = $1 AND created_at > $2;

-- Can cause issues with type inference
PREPARE find_recent (int, text) AS
    SELECT * FROM logs WHERE user_id = $1 AND created_at > $2::timestamp;
```

## Key Takeaways

- **Prepared statements provide security** by preventing SQL injection
- **They improve performance** by caching query plans
- Use **$1, $2, etc.** for parameters in PostgreSQL
- PostgreSQL uses **custom plans** for first 5 executions, then **generic plan** if beneficial
- **Most drivers provide prepared statement APIs** - use them!
- **Always parameterize user input** even for one-time queries
- Monitor using **pg_prepared_statements**
- Consider **force_custom_plan** for skewed data
- **Clean up** unused prepared statements in long-lived connections

Prepared statements are a foundational best practice for secure, efficient database applications. In the next lesson, we'll dive deeper into query plan caching and how PostgreSQL decides between custom and generic plans.
