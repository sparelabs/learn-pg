---
title: "Transaction ID Wraparound"
description: "Understand PostgreSQL's 32-bit transaction ID space, why it can wrap around, and how VACUUM FREEZE prevents catastrophic data loss"
estimatedMinutes: 50
---

# Transaction ID Wraparound

PostgreSQL uses 32-bit transaction IDs (XIDs) for its MVCC system. With just over 4 billion possible values, a busy database can exhaust this space. When it gets close to wrapping around, PostgreSQL takes increasingly drastic action — ultimately refusing to accept any new write transactions. Understanding XID wraparound is essential for anyone operating PostgreSQL in production.

## The 32-Bit Transaction ID Space

Every transaction in PostgreSQL is assigned an incrementing 32-bit integer ID:

```sql
SELECT txid_current();
```

The total space is 2^32 = 4,294,967,296 values. However, PostgreSQL uses **circular comparison** — it divides the space in half:

- XIDs within 2 billion **ahead** of a given XID are considered "in the future" (invisible)
- XIDs within 2 billion **behind** a given XID are considered "in the past" (visible if committed)

This means at any point, roughly 2 billion XIDs represent the past and 2 billion the future. A tuple created by an XID in the past is potentially visible; a tuple created by an XID in the future is not yet visible.

## The Wraparound Problem

Here is the critical issue: if a table's oldest tuple has `xmin = 100` and the current XID counter reaches `100 + 2,147,483,648`, then that tuple's XID would shift from "in the past" to "in the future." The tuple would suddenly become **invisible** — effectively disappearing.

This is data loss, and PostgreSQL goes to extreme lengths to prevent it.

## The Frozen XID

The solution is **freezing**. When VACUUM encounters a tuple old enough, it replaces the tuple's `xmin` with a special value called `FrozenTransactionId` (value 2). A frozen XID is always considered "in the past" regardless of the current XID counter — it is permanently visible (as long as the transaction committed).

Starting with PostgreSQL 9.4, freezing is implemented by setting a flag bit (`HEAP_XMIN_FROZEN`) in the tuple header rather than literally changing `xmin`. The effect is the same: the tuple is marked as permanently visible.

## Key Age Concepts

PostgreSQL tracks the age of transaction IDs using the `age()` function:

```sql
-- Age of a specific XID
SELECT age(xmin) FROM my_table LIMIT 1;

-- Age of the oldest unfrozen XID in a table
SELECT relname, age(relfrozenxid)
FROM pg_class
WHERE relkind = 'r'
ORDER BY age(relfrozenxid) DESC;

-- Age of the oldest unfrozen XID in each database
SELECT datname, age(datfrozenxid)
FROM pg_database
ORDER BY age(datfrozenxid) DESC;
```

The `age()` function returns how many transactions have occurred since the given XID. High ages mean the table/database has old unfrozen tuples that are getting closer to the wraparound boundary.

### relfrozenxid

Each table tracks its `relfrozenxid` in `pg_class` — the oldest XID that might exist unfrozen in the table. After VACUUM processes a table, `relfrozenxid` advances to the oldest unfrozen XID remaining.

### datfrozenxid

Each database tracks its `datfrozenxid` in `pg_database` — the minimum `relfrozenxid` across all tables in that database. The database-level age is only as young as the oldest table.

## Autovacuum Freeze Thresholds

Autovacuum has special thresholds for XID-based vacuuming that are independent of the dead tuple thresholds:

```sql
SHOW autovacuum_freeze_max_age;     -- Default: 200,000,000
SHOW vacuum_freeze_min_age;         -- Default: 50,000,000
SHOW vacuum_freeze_table_age;       -- Default: 150,000,000
```

### How They Work Together

1. **vacuum_freeze_min_age** (50M): During a normal VACUUM, only freeze tuples older than this. Younger tuples are left alone because they might still be needed for MVCC visibility.

2. **vacuum_freeze_table_age** (150M): When a table's `relfrozenxid` age exceeds this, the next VACUUM becomes an **aggressive vacuum** that scans the entire table (even all-visible pages) to freeze all eligible tuples.

3. **autovacuum_freeze_max_age** (200M): When a table's `relfrozenxid` age exceeds this, an **anti-wraparound autovacuum** is forced. This runs even if `autovacuum_enabled = false` on the table.

The progression:
```
Normal vacuum (dead tuples trigger)
  → Freezes tuples older than freeze_min_age
    → At freeze_table_age: aggressive vacuum (full table scan)
      → At freeze_max_age: anti-wraparound forced vacuum
        → At ~2 billion: DATABASE SHUTS DOWN FOR WRITES
```

## The Emergency Shutdown

If the XID counter reaches within 40 million of the wraparound point (about 2.1 billion age), PostgreSQL enters an emergency state:

```
WARNING: database "mydb" must be vacuumed within 39,730,048 transactions
HINT: To avoid a database shutdown, execute a database-wide VACUUM in that database.
```

If it reaches the actual limit:

```
ERROR: database is not accepting commands to avoid wraparound data loss in database "mydb"
HINT: Stop the postmaster and vacuum that database in single-user mode.
```

At this point, **no write transactions are accepted**. You must:
1. Stop PostgreSQL
2. Start in single-user mode: `postgres --single -D /path/to/data mydb`
3. Run `VACUUM FREEZE` on all tables
4. Restart normally

This is a serious production incident. The goal of monitoring XID age is to never get here.

## VACUUM FREEZE

You can manually force all eligible tuples to be frozen:

```sql
-- Freeze a specific table
VACUUM FREEZE my_table;

-- Verify the age was reduced
SELECT relname, age(relfrozenxid)
FROM pg_class
WHERE relname = 'my_table';
```

After `VACUUM FREEZE`, the table's `relfrozenxid` should be very recent (low age), because all old tuples have been frozen.

### VACUUM FREEZE vs Normal VACUUM

| Aspect | VACUUM | VACUUM FREEZE |
|--------|--------|---------------|
| Dead tuple cleanup | Yes | Yes |
| Freezes tuples | Only if older than `vacuum_freeze_min_age` | All eligible tuples |
| Scans all-visible pages | No (skips them) | Yes |
| Duration | Shorter (skips visible pages) | Longer (full table scan) |
| When to use | Regular maintenance | Before XID age gets critical |

## Monitoring Queries for Production

### Dashboard Query: XID Age Across All Tables

```sql
SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  age(c.relfrozenxid) AS xid_age,
  pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
  s.last_autovacuum,
  s.autovacuum_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY age(c.relfrozenxid) DESC
LIMIT 20;
```

### Dashboard Query: Database-Level XID Age

```sql
SELECT
  datname,
  age(datfrozenxid) AS xid_age,
  CASE
    WHEN age(datfrozenxid) > 1500000000 THEN 'CRITICAL'
    WHEN age(datfrozenxid) > 500000000 THEN 'WARNING'
    WHEN age(datfrozenxid) > 200000000 THEN 'ELEVATED'
    ELSE 'OK'
  END AS status,
  pg_size_pretty(pg_database_size(datname)) AS db_size
FROM pg_database
ORDER BY age(datfrozenxid) DESC;
```

### Alert Thresholds

Production monitoring should alert on:

| XID Age | Severity | Action |
|---------|----------|--------|
| > 200M | Info | Anti-wraparound vacuum should trigger automatically |
| > 500M | Warning | Investigate why autovacuum is not advancing `relfrozenxid` |
| > 1B | Critical | Manual intervention required |
| > 1.5B | Emergency | Immediate action — approaching shutdown threshold |

## Common Causes of High XID Age

### 1. Long-Running Transactions

A transaction that has been open for hours (or days) prevents VACUUM from freezing any tuples with XIDs newer than the transaction's snapshot. The solution is `idle_in_transaction_session_timeout`.

### 2. Disabled Autovacuum on Large Tables

If someone disabled autovacuum on a table and forgot about it, anti-wraparound vacuum still runs at `autovacuum_freeze_max_age`, but if the table is very large, it might take a long time to complete.

### 3. Replication Slots

Unused replication slots hold back the global XID horizon, preventing any table from advancing its `relfrozenxid` past the slot's recorded XID.

```sql
-- Check for stale replication slots
SELECT
  slot_name,
  slot_type,
  active,
  age(xmin) AS xmin_age,
  age(catalog_xmin) AS catalog_xmin_age
FROM pg_replication_slots;
```

### 4. Prepared Transactions

Two-phase commit transactions that are prepared but never committed or rolled back hold back the XID horizon:

```sql
SELECT
  gid,
  prepared,
  age(transaction) AS xid_age
FROM pg_prepared_xacts;
```

## 64-Bit Transaction IDs (PostgreSQL 17+)

PostgreSQL 17 does not eliminate the 32-bit XID space, but introduces improvements to the XID epoch tracking. The community has been working toward full 64-bit XIDs, which would effectively eliminate the wraparound problem. Until then, monitoring and VACUUM remain essential.

## Key Takeaways

- PostgreSQL uses 32-bit XIDs with circular comparison — wraparound means data loss
- VACUUM FREEZE permanently marks old tuples as visible, removing them from XID tracking
- `relfrozenxid` (table) and `datfrozenxid` (database) track the oldest unfrozen XIDs
- Anti-wraparound autovacuum forces vacuum at `autovacuum_freeze_max_age` (200M)
- At ~2.1 billion XID age, PostgreSQL refuses write transactions
- Monitor XID age in production and alert before it reaches dangerous levels
- Long transactions, stale replication slots, and prepared transactions can block freezing

> **Real-World Example (Spare)**
>
> In Spare's production database, the table with the highest XID age is
> `OpenFleetRematchingRecord` at **~498 million** — about 25% of the way to the
> 2-billion danger zone. Other tables like `FixedRouteLeg` (498M) and `Denial`
> (494M) are close behind. These numbers are safe but show real-world aging
> patterns — tables that receive fewer writes age faster because autovacuum
> doesn't visit them as often for freezing.
>
> **Try It Yourself**: Open Metabase and run:
> ```sql
> SELECT relname, age(relfrozenxid) AS xid_age
> FROM pg_class
> WHERE relkind = 'r'
>   AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
> ORDER BY age(relfrozenxid) DESC LIMIT 10;
> ```

In the next lesson, we will look at table bloat — the space that dead tuples leave behind even after VACUUM reclaims them.
