---
title: "Incident: Queries Slower After Deploy"
description: Investigate why the same queries became 10x slower after a data migration changed the data distribution
estimatedMinutes: 10
---

# Incident: Queries Slower After Deploy

## Alert

Thirty minutes after a deploy, the engineering team escalates:

> **The orders dashboard is timing out. Same queries, no code changes to the SQL -- just a data migration that backfilled a column.**

## Symptoms

- Specific queries on the `orders` table are 10x slower than before the deploy
- The SQL text has not changed -- it is the exact same `WHERE customer_id = ?` query
- The deploy included a data migration that backfilled the `customer_id` column for historical records
- `EXPLAIN` shows PostgreSQL switched from an Index Scan to a Bitmap Heap Scan or Sequential Scan
- The index on `customer_id` still exists and is not corrupt
- Running `ANALYZE` does not bring back the old plan

## Timeline

| Time | Event |
|------|-------|
| 2:00 PM | Deploy begins. Migration backfills `customer_id` for 95K historical rows |
| 2:05 PM | Deploy completes. All tests pass |
| 2:10 PM | Autovacuum runs ANALYZE on `orders` table (updates statistics) |
| 2:35 PM | Dashboard timeout alerts fire |

## Background

Before the migration, the `customer_id` column was sparsely populated:
- Only 5% of the 100,000 rows in `orders` had a non-null `customer_id`
- The column was highly selective -- querying `WHERE customer_id = 42` returned at most a handful of rows
- The planner consistently chose an Index Scan, which was very efficient

The migration backfilled `customer_id` for all historical records based on order metadata. After migration:
- 100% of rows now have a `customer_id`
- Most rows were assigned to a small set of ~50 frequent customers
- `customer_id = 42` now matches roughly 2,000 rows (2% of the table)

**Unlike the "slow database" scenario, running ANALYZE does not fix this.** The statistics are correct -- they accurately reflect the new data distribution. The planner is making a rational decision based on the current data. The fundamental problem is that the data distribution changed.

## Why the Plan Changed

The planner's decision depends on several factors that all shifted:

1. **Selectivity**: `customer_id = 42` used to match 0.01% of rows (highly selective). Now it matches 2% (much less selective). At a certain threshold, an Index Scan becomes more expensive than a Bitmap Heap Scan or Sequential Scan.

2. **Correlation**: The backfilled `customer_id` values were assigned randomly to existing rows. This means the physical correlation between the index order and the heap order is near zero. Low correlation makes index scans expensive because each row fetch is a random page read.

3. **Cost arithmetic**: The planner multiplies the number of expected rows by the random I/O cost. With 2,000 rows and a correlation near zero, the random I/O cost of 2,000 page fetches exceeds the cost of sequentially reading all pages.

## Diagnostic Approach

1. **Identify the slow query** -- use `EXPLAIN ANALYZE` to see the current plan and confirm the plan change
2. **Compare selective vs non-selective values** -- run `EXPLAIN ANALYZE` for a rare `customer_id` value to see that the planner still uses an Index Scan when the value is selective
3. **Check the column statistics** -- query `pg_stats` for the `correlation` value and `most_common_vals` to understand the statistical picture the planner is working with

## Concepts Involved

- `EXPLAIN ANALYZE` for plan comparison (from Query Planner Internals)
- `pg_stats` correlation and frequency statistics (from PostgreSQL Statistics)
- How data distribution affects plan choice (from Query Planner Internals)
- Physical correlation and index scan cost (from B-Tree Internals)
- The difference between "stale statistics" and "changed data distribution"
