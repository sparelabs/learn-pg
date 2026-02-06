---
title: Query Planner Architecture and Lifecycle
description: Learn how PostgreSQL's query planner works and the phases of query execution
estimatedMinutes: 45
---

# Query Planner Architecture and Lifecycle

The PostgreSQL query planner is the brain behind query execution. It takes your SQL query and determines the most efficient way to retrieve the data. Understanding how the planner works is crucial for writing efficient queries and diagnosing performance issues.

## Query Processing Lifecycle

When you execute a SQL query, PostgreSQL goes through several phases:

### 1. Parsing
The parser converts your SQL text into a parse tree, checking syntax and validating that referenced objects exist.

```sql
SELECT * FROM users WHERE age > 25;
```

The parser creates an abstract syntax tree (AST) representing the query structure.

### 2. Analysis/Rewriting
The analyzer:
- Resolves table and column names
- Validates data types
- Applies view definitions
- Executes query rewrite rules

### 3. Planning/Optimization
This is where the query planner comes in. The planner:
- Generates multiple possible execution plans
- Estimates the cost of each plan
- Selects the plan with the lowest estimated cost

### 4. Execution
The executor follows the chosen plan to retrieve and return data.

## Planner Architecture

### Cost-Based Optimization
PostgreSQL uses a **cost-based optimizer** (CBO). Instead of using rigid rules, it:
- Generates multiple candidate plans
- Estimates the "cost" of each plan (in arbitrary units)
- Chooses the plan with the lowest cost

The cost is primarily measured in:
- **Disk I/O**: Reading pages from disk (most expensive)
- **CPU**: Processing rows and evaluating expressions
- **Memory**: Sorting and hashing operations

### Statistics Collection
The planner relies heavily on table statistics:
- Row counts (cardinality)
- Value distributions (histograms)
- Common values and their frequencies
- NULL fraction
- Average column width

These statistics are gathered by `ANALYZE` and stored in `pg_statistic`.

```sql
-- Update statistics for a table
ANALYZE users;

-- View statistics
SELECT * FROM pg_stats WHERE tablename = 'users';
```

### Selectivity Estimation
The planner estimates how many rows will match each condition:

```sql
WHERE age > 25 AND city = 'New York'
```

For each condition, the planner calculates a **selectivity** (fraction of rows that match):
- `age > 25`: Maybe 60% of rows (selectivity = 0.6)
- `city = 'New York'`: Maybe 5% of rows (selectivity = 0.05)

Combined: 0.6 × 0.05 = 0.03 (3% of rows expected)

## Configuration Parameters

Several parameters affect planner behavior:

### Cost Constants
```sql
-- Show current cost settings
SHOW seq_page_cost;      -- Cost to read a sequential page (default: 1.0)
SHOW random_page_cost;   -- Cost to read a random page (default: 4.0)
SHOW cpu_tuple_cost;     -- Cost to process a row (default: 0.01)
SHOW cpu_operator_cost;  -- Cost to process an operator (default: 0.0025)
```

These can be adjusted based on your hardware:
```sql
-- For SSD storage, random access is cheaper
SET random_page_cost = 1.1;
```

### Memory Settings
```sql
SHOW work_mem;           -- Memory for sorts, hashes (default: 4MB)
SHOW shared_buffers;     -- Shared memory buffer (default: 128MB)
```

Larger `work_mem` allows in-memory sorts instead of disk-based sorts:
```sql
SET work_mem = '256MB';
```

## Planner Search Strategy

The planner doesn't try every possible plan (that would be exponential complexity). Instead:

1. **For small joins** (< 12 tables): Near-exhaustive search
2. **For large joins**: Genetic Query Optimizer (GEQO) uses genetic algorithms

```sql
SHOW geqo_threshold;  -- Tables before GEQO kicks in (default: 12)
```

## Plan Types

The planner can choose from various plan node types:

### Scan Methods
- **Sequential Scan**: Read entire table
- **Index Scan**: Use index to find rows
- **Index Only Scan**: Get data from index alone
- **Bitmap Scan**: Combine multiple indexes

### Join Methods
- **Nested Loop**: For each row in outer table, scan inner table
- **Hash Join**: Build hash table, probe for matches
- **Merge Join**: Sort both sides, merge together

### Other Operations
- **Sort**: Order rows
- **Aggregate**: GROUP BY operations
- **Subquery Scan**: Execute subquery

## Example: Planner in Action

Consider this query:
```sql
SELECT u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.age > 25
ORDER BY o.total DESC;
```

The planner must decide:
1. Which table to scan first?
2. Use indexes or sequential scans?
3. Which join method (nested loop, hash, merge)?
4. When to apply the age filter?
5. When to sort?

Each decision affects the total cost. The planner explores combinations and picks the winner.

## Why Understanding the Planner Matters

1. **Query Optimization**: You can write queries that help the planner choose better plans
2. **Index Design**: Understand which indexes will actually be used
3. **Performance Debugging**: Diagnose why a query is slow
4. **Configuration Tuning**: Adjust parameters for your workload

## Key Takeaways

- PostgreSQL uses cost-based optimization
- Statistics drive planner decisions (run ANALYZE regularly!)
- The planner generates and compares multiple plans
- Costs are estimates based on statistics, not actual measurements
- Configuration parameters affect cost calculations
- Understanding the planner helps you write better queries

In the next lessons, we'll dive deep into reading EXPLAIN output and understanding specific plan node types.
