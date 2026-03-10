---
title: "Incident: XID Wraparound Warning"
description: Respond to a transaction ID wraparound warning before PostgreSQL shuts down writes
estimatedMinutes: 7
---

# Incident: XID Wraparound Warning

## Alert

Your monitoring system fires a critical alert at 11:00 AM:

> **PostgreSQL datfrozenxid age exceeds 150,000,000 on database "myapp".**

This is a precursor to one of PostgreSQL's most dangerous failure modes: **transaction ID wraparound**. If this is not addressed, PostgreSQL will eventually refuse all write operations.

## Symptoms

- Monitoring shows `age(datfrozenxid)` is at 150 million and climbing
- PostgreSQL logs contain warnings: `WARNING: database "myapp" must be vacuumed within N transactions`
- Autovacuum is running but does not appear to be making progress on the oldest frozen XIDs
- Some very large tables have `relfrozenxid` ages significantly higher than others

## Background: The XID Wraparound Problem

PostgreSQL uses 32-bit transaction IDs (XIDs), giving a range of about 4 billion values. At any point, roughly 2 billion XIDs are considered "in the past" and 2 billion are "in the future." This means the system can only handle about 2 billion transactions before IDs wrap around.

To prevent wraparound, PostgreSQL **freezes** old tuples -- marking them as visible to all transactions regardless of their XID. The `VACUUM FREEZE` process handles this. Key thresholds:

| Threshold | Default | What Happens |
|-----------|---------|-------------|
| `vacuum_freeze_min_age` | 50M | Normal VACUUM can freeze tuples older than this |
| `autovacuum_freeze_max_age` | 200M | Anti-wraparound autovacuum triggers at this age |
| Hard limit | ~2B | PostgreSQL refuses ALL writes to prevent corruption |

In this scenario, a combination of very large tables and long-running transactions has prevented autovacuum from completing its freeze work. A long-running analytical query held a transaction open for hours, blocking VACUUM from freezing tuples visible to that transaction. The transaction ID age has crept past the 150 million warning threshold.

## Why This Is Critical

If `age(datfrozenxid)` reaches approximately 2 billion:
- PostgreSQL **shuts down all write operations** to prevent data corruption
- The database enters a read-only emergency mode
- Recovery requires running `VACUUM FREEZE` in single-user mode
- This can take hours or days on large databases

The warning at 150 million gives you time to act, but you must treat it as urgent.

## Diagnostic Approach

1. **Assess the situation** -- find which databases have the oldest unfrozen transaction IDs using `pg_database`
2. **Find and freeze the worst offenders** -- identify the tables with the oldest `relfrozenxid` and run `VACUUM FREEZE` on them, starting with the highest age

## Concepts Involved

- Transaction ID wraparound mechanics
- `age(datfrozenxid)` and `age(relfrozenxid)` monitoring (from Operational Health)
- `VACUUM FREEZE` for emergency XID management
- `pg_database` and `pg_class` system catalogs (from Storage Internals)
