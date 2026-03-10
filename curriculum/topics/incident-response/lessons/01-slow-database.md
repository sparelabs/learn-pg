---
title: "Incident: The Database Is Slow"
description: Diagnose and fix a database that has become slow due to stale statistics causing bad query plans
estimatedMinutes: 10
---

# Incident: The Database Is Slow

## Alert

You receive a PagerDuty alert at 3:47 PM:

> **API p99 latency exceeded 5s threshold.**

The on-call engineer confirms that the application is healthy -- CPU and memory are normal, no recent deploys. The finger points at the database.

## Symptoms

- Application response times jumped from ~200ms to 4-5 seconds about 30 minutes ago
- The database server itself shows normal CPU and memory usage -- it is not overloaded
- No connection pool exhaustion -- connections are available, they are just slow to return results
- The slow queries appear to be ordinary `SELECT` statements on the `orders` table that used to be fast
- Multiple endpoints are affected, but they all touch the same table

## Timeline

| Time | Event |
|------|-------|
| 2:00 PM | Batch job started: data retention cleanup on `orders` table |
| 2:45 PM | Batch job completed. Deleted ~90% of historical records |
| 3:15 PM | First signs of elevated latency in application metrics |
| 3:47 PM | p99 latency alert fires |

## Background

The `orders` table is a core table in the application, queried on nearly every API request. Earlier today, a scheduled batch job ran a large `DELETE` operation to purge historical orders as part of a data retention policy. The cleanup removed approximately 45,000 of the 50,000 rows.

The batch job completed successfully and the application appeared to return to normal operation -- but about 30 minutes later, performance collapsed.

**The critical detail**: no one ran `ANALYZE` after the bulk delete. PostgreSQL's query planner still believes the table has 50,000 rows with the original value distribution. It is making plan choices based on data that no longer exists.

## Why This Happens

PostgreSQL's query planner relies on statistics stored in `pg_statistic` (readable via `pg_stats`) to estimate how many rows a query will return and which access path is cheapest. These statistics are a snapshot from the last time `ANALYZE` ran.

When the actual data no longer matches the statistics:
- The planner overestimates row counts for filter conditions, choosing Sequential Scans when Index Scans would be more efficient
- Or it underestimates row counts, choosing Nested Loop Joins when Hash Joins would be faster
- Cost estimates are wrong, leading to plans that are orders of magnitude slower than optimal

Autovacuum normally runs `ANALYZE` automatically, but it may not have triggered yet, or it may be delayed by other work.

## Diagnostic Approach

You need to:

1. **Identify the slow queries** using `pg_stat_statements` -- this is always the first step when you know "the database is slow" but not which queries are the problem
2. **Examine the bad plan** with `EXPLAIN ANALYZE` to see the mismatch between estimated and actual rows -- this confirms the root cause is stale statistics
3. **Fix the statistics** with `ANALYZE` and re-run `EXPLAIN ANALYZE` to verify the plan improves

## Concepts Involved

- `pg_stat_statements` for identifying expensive queries (from Operational Health)
- `EXPLAIN ANALYZE` for plan analysis (from Query Planner Internals)
- PostgreSQL statistics and `ANALYZE` (from PostgreSQL Statistics)
- How stale statistics lead to bad estimates and wrong plan choices
