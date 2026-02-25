---
title: Partition Pruning
description: Understand how PostgreSQL eliminates irrelevant partitions during planning and execution
estimatedMinutes: 30
---

# Partition Pruning

Partition pruning is the primary performance benefit of partitioning. When a query's WHERE clause matches the partition key, PostgreSQL can skip (prune) partitions that can't contain matching rows. Instead of scanning the entire table, it only scans the relevant partitions.

## How Pruning Works

When you query a partitioned table:

```sql
SELECT * FROM events
WHERE created_at >= '2025-01-01' AND created_at < '2025-02-01';
```

The planner looks at the partition boundaries and determines that only the `events_2025_01` partition can contain matching rows. All other partitions are **pruned** — never scanned at all.

## Observing Pruning with EXPLAIN

EXPLAIN shows which partitions are included in the plan:

```sql
EXPLAIN (ANALYZE)
SELECT * FROM events
WHERE created_at >= '2025-01-01' AND created_at < '2025-02-01';
```

```
Append (actual rows=1000)
  ->  Seq Scan on events_2025_01 (actual rows=1000)
        Filter: (created_at >= ... AND created_at < ...)
```

Only one partition appears in the plan. Without pruning, you'd see all partitions listed.

### No Pruning

When the query doesn't filter on the partition key, all partitions must be scanned:

```sql
EXPLAIN (ANALYZE)
SELECT * FROM events;
```

```
Append (actual rows=5000)
  ->  Seq Scan on events_2025_01 (actual rows=1000)
  ->  Seq Scan on events_2025_02 (actual rows=1000)
  ->  Seq Scan on events_2025_03 (actual rows=1000)
  ->  Seq Scan on events_2025_04 (actual rows=1000)
  ->  Seq Scan on events_2025_05 (actual rows=1000)
```

Every partition is scanned. This is no better (and slightly worse due to Append overhead) than scanning a single unpartitioned table.

## Plan-Time vs Run-Time Pruning

### Plan-Time Pruning
When the filter values are known at plan time (literal values):
```sql
SELECT * FROM events WHERE created_at = '2025-03-15';
-- Planner prunes at plan time
```

### Run-Time Pruning
When filter values come from parameters or subqueries:
```sql
PREPARE q AS SELECT * FROM events WHERE created_at = $1;
EXECUTE q('2025-03-15');
-- Pruning happens at execution time (PostgreSQL 11+)
```

Run-time pruning is important for prepared statements and parameterized queries.

## Partition-Wise Aggregation

By default, PostgreSQL aggregates results from all partitions after combining them. With `enable_partitionwise_aggregate`, it can aggregate within each partition first, then combine:

```sql
SET enable_partitionwise_aggregate = on;
EXPLAIN (ANALYZE)
SELECT date_trunc('month', created_at), count(*)
FROM events
GROUP BY 1;
```

With partition-wise aggregation:
```
Append
  ->  HashAggregate on events_2025_01  (partial aggregate per partition)
  ->  HashAggregate on events_2025_02
  ->  HashAggregate on events_2025_03
```

This can be faster because each partition's aggregation fits in work_mem independently, and the partitions can be processed in parallel.

## Partition-Wise Joins

Similarly, `enable_partitionwise_join` allows PostgreSQL to join partitions individually when both sides are partitioned on the join key:

```sql
SET enable_partitionwise_join = on;
```

This is most effective when joining two tables partitioned by the same key (e.g., events and event_details both partitioned by date).

## Pruning Requirements

For pruning to work:
1. The query must filter on the **partition key** column
2. The filter must use operators the partition strategy understands (`=`, `<`, `>`, `BETWEEN` for range; `=` for list; `=` for hash)
3. The filter must use literal values or parameters (not expressions on the column)

```sql
-- Pruning works:
WHERE created_at = '2025-03-15'

-- Pruning does NOT work (function on the partition key):
WHERE date_trunc('month', created_at) = '2025-03-01'
```

## Key Takeaways

- Partition pruning skips partitions that can't contain matching rows — the main performance win
- Check EXPLAIN output to verify pruning is happening (look for which partitions appear)
- Queries without a filter on the partition key scan all partitions
- Run-time pruning works with prepared statements and parameterized queries
- `enable_partitionwise_aggregate` and `enable_partitionwise_join` enable per-partition operations
- Functions on the partition key column prevent pruning — filter on the raw column value

Next, we'll cover partition maintenance: attaching, detaching, and managing partitions over time.
