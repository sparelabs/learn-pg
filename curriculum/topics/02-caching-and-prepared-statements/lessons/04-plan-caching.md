---
title: Query Plan Caching and Reuse
description: Deep dive into how PostgreSQL caches and reuses query execution plans
estimatedMinutes: 50
---

# Query Plan Caching and Reuse

Query plan caching is a sophisticated optimization that can significantly improve performance. Understanding how PostgreSQL decides when to cache plans, when to reuse them, and when to create custom plans is essential for building high-performance applications.

## Query Plan Lifecycle

###Normal Query (No Caching)

Every execution goes through full cycle:

```sql
SELECT * FROM users WHERE email = 'alice@example.com';
```

```
1. Parse        → Convert SQL text to parse tree (0.02-0.1ms)
2. Analyze      → Resolve names, types (0.05-0.2ms)
3. Rewrite      → Apply rules, views (0.01-0.05ms)
4. Plan         → Generate execution plan (0.1-2ms)
5. Execute      → Run the plan (0.1-100ms+)
```

**Total overhead**: 0.2-2.5ms per query

For fast queries (< 1ms execution), planning overhead can dominate!

### Prepared Statement (With Caching)

First execution (PREPARE + first EXECUTE):

```sql
PREPARE get_user (text) AS
    SELECT * FROM users WHERE email = $1;

EXECUTE get_user('alice@example.com');
```

```
PREPARE:
1. Parse        → Parse tree (0.02-0.1ms)
2. Analyze      → Query tree (0.05-0.2ms)

EXECUTE (custom plan):
3. Rewrite      → (0.01-0.05ms)
4. Plan         → Custom plan for this parameter (0.1-2ms)
5. Execute      → Run the plan (0.1-100ms+)
```

Subsequent executions (after 5 custom plans):

```sql
EXECUTE get_user('bob@example.com');
```

```
EXECUTE (generic plan):
3. Execute      → Run cached plan (0.1-100ms+)
```

Parsing and analysis saved, and eventually planning too!

## Custom Plans vs Generic Plans

### Custom Plans

A **custom plan** is generated with knowledge of actual parameter values.

```sql
PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

EXECUTE get_orders(123);
```

During planning, PostgreSQL knows `user_id = 123` and can:
- Look up statistics for how many rows match `user_id = 123`
- Decide between Index Scan vs Seq Scan based on row count
- Choose optimal join order if joining tables

**Benefits**:
- Plan is optimized for specific parameter value
- Can handle skewed data well
- Uses actual statistics

**Costs**:
- Must plan on every execution
- Planning overhead (0.1-2ms per execution)

### Generic Plans

A **generic plan** is generated without knowing parameter values.

```sql
-- After 5 custom plan executions
EXECUTE get_orders(456);  -- Uses generic plan
```

During planning, PostgreSQL doesn't know the parameter value, so:
- Estimates row counts using overall statistics
- Makes conservative decisions
- Creates a plan that works reasonably well for "typical" values

**Benefits**:
- Plan created once, reused many times
- No planning overhead on subsequent executions
- Consistent, predictable performance

**Costs**:
- May be suboptimal for specific values
- Can be bad for skewed data
- Less adaptive to data distribution

## The 5-Execution Rule

PostgreSQL uses an adaptive strategy:

### Phase 1: First 5 Executions (Custom Plans)

```sql
PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

EXECUTE get_orders(100);  -- Execution 1: Custom plan, cost = 8.5
EXECUTE get_orders(200);  -- Execution 2: Custom plan, cost = 9.2
EXECUTE get_orders(300);  -- Execution 3: Custom plan, cost = 8.7
EXECUTE get_orders(400);  -- Execution 4: Custom plan, cost = 8.9
EXECUTE get_orders(500);  -- Execution 5: Custom plan, cost = 8.6
```

PostgreSQL tracks the average cost: (8.5 + 9.2 + 8.7 + 8.9 + 8.6) / 5 = 8.78

### Phase 2: Generic Plan Evaluation

After 5 executions, PostgreSQL:
1. Generates a generic plan (without parameter values)
2. Estimates its cost: e.g., 9.5
3. Compares: generic cost (9.5) vs average custom cost (8.78)

**Decision logic**:
```python
if generic_plan_cost <= avg_custom_plan_cost * 1.0:
    use_generic_plan = True
else:
    use_generic_plan = False  # Keep using custom plans
```

### Phase 3: Execution 6 and Beyond

If generic plan is chosen:
```sql
EXECUTE get_orders(600);  -- Generic plan (cached)
EXECUTE get_orders(700);  -- Generic plan (cached)
EXECUTE get_orders(800);  -- Generic plan (cached)
```

No more planning! Just execute the cached generic plan.

## Viewing Plan Choice

### Check Prepared Statement Statistics

```sql
SELECT
    name,
    statement,
    prepare_time,
    calls,
    generic_plans,
    custom_plans
FROM pg_prepared_statements;
```

**Example output**:
```
     name      |          statement           | prepare_time | calls | generic_plans | custom_plans
---------------+------------------------------+--------------+-------+---------------+--------------
 get_orders    | SELECT * FROM orders ...     | 2024-02-05   |   100 |            95 |            5
 get_user      | SELECT * FROM users ...      | 2024-02-05   |     3 |             0 |            3
```

**Interpretation**:
- `get_orders`: Used generic plan after 5 custom plans (95 generic + 5 custom = 100 calls)
- `get_user`: Only 3 calls so far, still using custom plans

### Force Plan Inspection

Use `EXPLAIN` with prepared statement:

```sql
PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

-- See the generic plan
EXPLAIN EXECUTE get_orders(123);
```

After 6+ executions, this shows the cached generic plan.

## Controlling Plan Choice

### plan_cache_mode Configuration

```sql
-- Check current setting
SHOW plan_cache_mode;
```

**Options**:

#### 1. auto (default)

Automatically choose based on 5-execution rule:

```sql
SET plan_cache_mode = 'auto';
```

Use this unless you have specific reasons not to.

#### 2. force_generic_plan

Always use generic plans:

```sql
SET plan_cache_mode = 'force_generic_plan';

PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

EXECUTE get_orders(123);  -- Generic plan from first execution
```

**When to use**:
- Uniform data distribution (no skew)
- Query execution time >> planning time
- You've verified generic plan is good enough
- Want consistent performance

#### 3. force_custom_plan

Always use custom plans:

```sql
SET plan_cache_mode = 'force_custom_plan';

PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

EXECUTE get_orders(123);  -- Custom plan every time
```

**When to use**:
- Highly skewed data
- Parameter values dramatically affect plan choice
- Planning time is negligible vs execution time
- Need optimal plan for each execution

## Real-World Examples

### Example 1: Uniform Distribution

**Scenario**: User IDs evenly distributed, all users have ~100 orders

```sql
PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

-- Execution 1-5: Custom plans, all choose Index Scan, cost ≈ 8.5
-- Generic plan: Also chooses Index Scan, cost ≈ 8.6
-- Decision: Use generic plan (8.6 ≈ 8.5)
```

**Result**: Generic plan is fine, saves planning overhead.

### Example 2: Skewed Distribution

**Scenario**: user_id = 1 has 5M orders (VIP), most users have < 100 orders

```sql
PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

-- Execution 1: user_id = 2 (50 orders) → Index Scan, cost = 8.0
-- Execution 2: user_id = 3 (75 orders) → Index Scan, cost = 8.2
-- Execution 3: user_id = 4 (30 orders) → Index Scan, cost = 7.8
-- Execution 4: user_id = 1 (5M orders) → Seq Scan, cost = 150,000
-- Execution 5: user_id = 5 (60 orders) → Index Scan, cost = 8.1

-- Average custom cost = (8.0 + 8.2 + 7.8 + 150,000 + 8.1) / 5 = 30,006
-- Generic plan cost (conservative) = 75,000 (assumes moderate selectivity)

-- Decision: Keep using custom plans (75,000 >> 30,006)
```

**Result**: Custom plans continue because generic plan would be much worse on average.

**Better solution for this case**:
```sql
-- Just use custom plans
SET plan_cache_mode = 'force_custom_plan';
```

### Example 3: Temporal Query

**Scenario**: Queries for recent data (hot partition) vs old data (cold partition)

```sql
PREPARE get_logs (date) AS
    SELECT * FROM logs WHERE created_at > $1;

-- Recent date: Few rows, Index Scan
-- Old date: Many rows, Seq Scan

-- Generic plan might choose middle ground that's suboptimal for both
```

**Solution**: Use custom plans for better adaptation:
```sql
SET plan_cache_mode = 'force_custom_plan';
```

## Plan Invalidation

Cached plans become invalid when:

### 1. Schema Changes

```sql
PREPARE get_user (int) AS
    SELECT id, name, email FROM users WHERE id = $1;

-- Later: add column
ALTER TABLE users ADD COLUMN phone text;

-- Next execution: Plan is invalidated, regenerated automatically
EXECUTE get_user(123);
```

PostgreSQL tracks schema versions and invalidates plans automatically.

### 2. Statistics Changes

```sql
PREPARE get_orders (int) AS
    SELECT * FROM orders WHERE user_id = $1;

-- Significant data changes
INSERT INTO orders SELECT ... -- 10M new rows

-- Update statistics
ANALYZE orders;

-- Next execution: May trigger replanning
-- Generic plan cost calculation uses new statistics
```

### 3. Index Creation/Drop

```sql
PREPARE find_users (text) AS
    SELECT * FROM users WHERE email = $1;

-- Later: add index
CREATE INDEX users_email_idx ON users(email);

-- Next execution: Plan invalidated, new plan uses index
```

### 4. Configuration Changes

```sql
PREPARE get_data AS SELECT * FROM large_table;

-- Change planner settings
SET random_page_cost = 1.1;  -- Was 4.0 (HDD → SSD)

-- Next execution: Costs recalculated, plan may change
```

## Performance Tuning with Plan Caching

### Measure Planning vs Execution Time

```sql
\timing on

-- Without prepared statements
EXPLAIN (ANALYZE, TIMING ON)
SELECT * FROM users WHERE email = 'alice@example.com';
```

**Output**:
```
Planning Time: 0.287 ms
Execution Time: 0.052 ms
```

Planning takes 5× longer than execution!

```sql
-- With prepared statements
PREPARE get_user (text) AS
    SELECT * FROM users WHERE email = $1;

EXPLAIN (ANALYZE, TIMING ON) EXECUTE get_user('alice@example.com');
```

**First execution**:
```
Planning Time: 0.304 ms
Execution Time: 0.049 ms
```

**After switching to generic plan**:
```
Planning Time: 0.000 ms
Execution Time: 0.051 ms
```

No planning time!

### Calculate Savings

For a query executed 10,000 times/second:

**Without prepared statements**:
- Planning: 0.3ms × 10,000 = 3,000ms = 3 seconds of CPU time per second
- Unsustainable! (300% CPU usage on planning alone)

**With prepared statements (generic plan)**:
- Planning: 0.3ms × 1 (one-time) = 0.3ms total
- Savings: 3,000ms - 0.3ms = ~3,000ms per second

Prepared statements reduce CPU usage by planning overhead!

### Identify Candidates for Prepared Statements

Query pg_stat_statements for frequently executed queries:

```sql
SELECT
    query,
    calls,
    mean_plan_time,
    mean_exec_time,
    mean_plan_time / NULLIF(mean_exec_time, 0) AS plan_to_exec_ratio
FROM pg_stat_statements
WHERE calls > 100
    AND mean_plan_time > 0
ORDER BY (mean_plan_time * calls) DESC
LIMIT 20;
```

**Look for**:
- High `calls` (executed frequently)
- High `plan_to_exec_ratio` (planning is significant portion)
- Total planning time (mean_plan_time × calls) is high

These are best candidates for prepared statements.

## Advanced Topics

### Parameterized Views

Create views with common filters, prepare statements against them:

```sql
CREATE VIEW active_users AS
    SELECT * FROM users WHERE status = 'active';

PREPARE get_active_user (text) AS
    SELECT * FROM active_users WHERE email = $1;
```

Plan incorporates the view definition and can be cached.

### Prepared Statements in Functions

PL/pgSQL functions cache plans automatically:

```sql
CREATE FUNCTION get_user_orders(user_id_param int)
RETURNS TABLE(id int, total numeric, created_at timestamp) AS $$
BEGIN
    RETURN QUERY
    SELECT id, total, created_at
    FROM orders
    WHERE user_id = user_id_param;  -- Plan is cached!
END;
$$ LANGUAGE plpgsql;
```

First call: Plans the query
Subsequent calls: Reuses cached plan

### Parallel Query Plans

Generic plans can use parallelism:

```sql
PREPARE count_orders AS
    SELECT COUNT(*) FROM orders;

-- Generic plan may use Parallel Seq Scan
EXECUTE count_orders;
```

Plan cache includes parallel plan nodes.

## Troubleshooting Plan Caching Issues

### Problem: Generic Plan is Slow

**Symptoms**: Query fast first 5 executions, then suddenly slow

**Diagnosis**:
```sql
-- Check if using generic plan
SELECT name, generic_plans, custom_plans
FROM pg_prepared_statements
WHERE name = 'my_query';

-- Force custom plan temporarily
SET plan_cache_mode = 'force_custom_plan';
EXECUTE my_query(...);
```

**Solution**:
```sql
-- Set for this prepared statement's session
SET plan_cache_mode = 'force_custom_plan';

-- Or redesign query to be more amenable to generic plans
-- (e.g., avoid parameter values with wildly different selectivities)
```

### Problem: Planning Overhead Still High

**Symptoms**: Even with prepared statements, planning time significant

**Diagnosis**:
```sql
-- Check if actually using generic plan
SELECT name, generic_plans FROM pg_prepared_statements;
```

If `generic_plans = 0`, it's using custom plans (no caching).

**Solution**:
```sql
-- Force generic plan if appropriate
SET plan_cache_mode = 'force_generic_plan';

-- Or investigate why generic plan not chosen
-- (likely cost estimate issue)
```

### Problem: Inconsistent Performance

**Symptoms**: Same query sometimes fast, sometimes slow

**Diagnosis**:
```sql
-- Check plan choice
EXPLAIN (ANALYZE) EXECUTE my_query(...);
```

Run multiple times with different parameters, compare plans.

**Solution**:
- If plans differ: Using custom plans (expected for skewed data)
- If you want consistency: Force generic plan
- If you want optimization: Keep custom plans

## Key Takeaways

- **Custom plans** are created with parameter values, optimal for specific inputs
- **Generic plans** are created without parameters, reusable across executions
- PostgreSQL uses **5-execution rule** to decide when to switch to generic plan
- **plan_cache_mode** controls behavior: auto (default), force_generic_plan, force_custom_plan
- **Generic plans save planning time** (0.1-2ms per execution)
- **Use custom plans for skewed data** where parameter values dramatically affect optimal plan
- **Monitor using pg_prepared_statements** to see plan choice
- **Schema changes invalidate plans** automatically
- **PL/pgSQL functions cache plans** automatically
- Query **pg_stat_statements** to find candidates for prepared statements

Understanding plan caching allows you to:
- Reduce planning overhead for frequently executed queries
- Handle skewed data appropriately
- Achieve consistent or optimal performance depending on needs
- Troubleshoot unexpected performance changes

Master plan caching, and you'll eliminate a major source of CPU overhead in high-throughput applications!
