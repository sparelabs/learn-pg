---
title: "Incident: Disk Space Running Out"
description: Diagnose and fix a disk space crisis caused by table bloat from disabled autovacuum
estimatedMinutes: 8
---

# Incident: Disk Space Running Out

## Alert

The infrastructure team pages you at 2:15 AM:

> **Database disk usage at 92% and climbing.**

At the current rate of growth, the volume will be full within 6 hours. If the disk fills completely, PostgreSQL will crash and refuse to start -- a catastrophic failure requiring manual recovery.

## Symptoms

- Disk usage is growing steadily at ~1 GB per hour despite no significant data growth in the application
- Application metrics show normal write volume -- no unusual bulk operations
- One table (`audit_log`) shows a massive discrepancy between its row count and its on-disk size
- `pg_stat_user_tables` shows `n_dead_tup` in the millions for that table
- `last_autovacuum` and `last_vacuum` are both NULL for the problematic table

## Timeline

| Time | Event |
|------|-------|
| 3 weeks ago | Developer added `autovacuum_enabled = false` to `audit_log` table |
| 3 weeks ago | Developer planned to set up manual vacuum cron job -- forgot to do it |
| Since then | Every UPDATE creates dead tuples that are never cleaned up |
| Today 2:15 AM | Disk alert fires at 92% |

## Background

Three weeks ago, a developer was investigating performance issues with the `audit_log` table. They noticed that autovacuum was running frequently and competing with write-heavy workloads, so they disabled it:

```sql
ALTER TABLE audit_log SET (autovacuum_enabled = false);
```

The intention was to run `VACUUM` manually during off-peak maintenance windows. A ticket was created to set up a cron job, but it was never completed.

Since then, the table has been processing thousands of `UPDATE` operations per hour. Each update creates a new tuple version, and the old version becomes a **dead tuple**. Normally, autovacuum would reclaim this space. With autovacuum disabled, the dead tuples accumulate indefinitely, and the table's on-disk size grows without bound.

## Why Dead Tuples Consume Disk

PostgreSQL's MVCC architecture means that `UPDATE` and `DELETE` do not immediately remove old row versions. The old tuple remains on disk until `VACUUM` marks the space as reusable. Without VACUUM:

- Each `UPDATE` adds a new tuple but the old one stays, effectively doubling the space per update
- After N rounds of updates, the table can be N+1 times its expected size
- The dead tuples are invisible to queries but fully consume disk space
- Indexes also grow as they point to both live and dead tuple versions

## Diagnostic Approach

You need to stop the bleeding and prevent recurrence:

1. **Find the bloated table** -- identify which table is consuming the most space and has the most dead tuples using `pg_stat_user_tables` and `pg_total_relation_size()`
2. **Confirm autovacuum is not running** -- verify that the table has never been vacuumed by checking `last_autovacuum` and `last_vacuum`
3. **Vacuum and fix the configuration** -- run `VACUUM` to reclaim dead tuple space, then set aggressive autovacuum parameters to prevent recurrence

## Concepts Involved

- Dead tuples and MVCC bloat (from Storage Internals)
- `pg_stat_user_tables` monitoring (from Operational Health)
- VACUUM mechanics and autovacuum configuration
- Per-table autovacuum tuning with storage parameters
