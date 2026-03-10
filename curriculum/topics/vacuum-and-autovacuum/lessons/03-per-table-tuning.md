---
title: "Per-Table Autovacuum Tuning"
description: "Learn how to configure autovacuum settings on individual tables to handle high-churn workloads and optimize vacuum frequency"
estimatedMinutes: 40
---

# Per-Table Autovacuum Tuning

The default autovacuum settings work well for average tables, but many production databases have tables with wildly different workload patterns. A user sessions table that gets updated every second needs very different vacuum behavior than a reference table that rarely changes. PostgreSQL allows you to override autovacuum settings on a per-table basis.

## Why Per-Table Tuning?

Consider these common scenarios:

**High-churn tables** (e.g., session state, job queues, counters):
- Hundreds of thousands of updates per hour
- Default 20% scale factor means autovacuum waits far too long
- Dead tuples accumulate, bloating the table and slowing queries

**Large, mostly-read tables** (e.g., product catalog, configuration):
- Millions of rows, occasional batch updates
- Default settings trigger autovacuum too eagerly on small changes
- Autovacuum runs are expensive due to table size

**Append-only tables** (e.g., audit logs, event streams):
- Only INSERTs, no UPDATEs or DELETEs
- Dead tuples are rare; vacuum is mainly needed for freezing (XID management)
- Can use relaxed settings to reduce overhead

## Storage Parameters

PostgreSQL stores per-table autovacuum settings as **storage parameters** (also called `reloptions`) on the table's `pg_class` entry:

```sql
-- Set aggressive autovacuum on a high-churn table
ALTER TABLE user_sessions SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 100
);

-- Verify the settings
SELECT relname, reloptions
FROM pg_class
WHERE relname = 'user_sessions';
```

```
    relname     |                          reloptions
----------------+---------------------------------------------------------------
 user_sessions  | {autovacuum_vacuum_scale_factor=0.01,autovacuum_vacuum_threshold=100}
```

With these settings, autovacuum triggers after just 1% of rows become dead tuples (plus 100 base threshold), instead of the default 20%.

## Available Per-Table Settings

All of these can be set with `ALTER TABLE ... SET (...)`:

### Vacuum Trigger Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `autovacuum_vacuum_threshold` | 50 | Base number of dead tuples before vacuum |
| `autovacuum_vacuum_scale_factor` | 0.2 | Fraction of table to add to threshold |
| `autovacuum_vacuum_insert_threshold` | 1000 | Inserts before vacuum (for freezing) |
| `autovacuum_vacuum_insert_scale_factor` | 0.2 | Fraction of table for insert threshold |

### Analyze Trigger Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `autovacuum_analyze_threshold` | 50 | Base number of modifications before analyze |
| `autovacuum_analyze_scale_factor` | 0.1 | Fraction of table to add to threshold |

### I/O Throttling Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `autovacuum_vacuum_cost_delay` | 2ms | Sleep time per cost cycle |
| `autovacuum_vacuum_cost_limit` | -1 (use global) | Cost limit per cycle |

### Freezing Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `autovacuum_freeze_min_age` | 50,000,000 | Minimum XID age before freezing |
| `autovacuum_freeze_max_age` | 200,000,000 | Force vacuum when XID age exceeds this |
| `autovacuum_freeze_table_age` | 150,000,000 | Age to trigger aggressive (whole-table) vacuum |
| `autovacuum_multixact_freeze_min_age` | 5,000,000 | Same for MultiXact IDs |
| `autovacuum_multixact_freeze_max_age` | 400,000,000 | Same for MultiXact IDs |
| `autovacuum_multixact_freeze_table_age` | 150,000,000 | Same for MultiXact IDs |

### On/Off Switch

| Setting | Default | Description |
|---------|---------|-------------|
| `autovacuum_enabled` | true | Enable/disable autovacuum for this table |

**Warning**: Disabling autovacuum on a table does NOT prevent anti-wraparound vacuums. If the table's `relfrozenxid` age approaches `autovacuum_freeze_max_age`, PostgreSQL will vacuum it regardless of this setting.

## Tuning Recipes

### Recipe 1: High-Churn Table

A table receiving thousands of updates per minute:

```sql
ALTER TABLE hot_table SET (
  autovacuum_vacuum_scale_factor = 0.01,  -- Trigger at 1% dead tuples
  autovacuum_vacuum_threshold = 100,       -- Low base threshold
  autovacuum_vacuum_cost_delay = 0,        -- No throttling
  autovacuum_vacuum_cost_limit = 1000      -- Higher work per cycle
);
```

This makes autovacuum run frequently with minimal throttling. The 1% scale factor means a 100K-row table triggers vacuum after just 1,100 dead tuples instead of 20,050.

### Recipe 2: Large, Mostly-Static Table

A multi-million row table that gets occasional batch updates:

```sql
ALTER TABLE large_reference_table SET (
  autovacuum_vacuum_scale_factor = 0.005,  -- 0.5% (prevent massive dead tuple buildups)
  autovacuum_vacuum_threshold = 10000,     -- Higher base to avoid constant vacuuming
  autovacuum_vacuum_cost_delay = 5,        -- Slower to reduce I/O impact
  fillfactor = 90                          -- Leave room for HOT updates
);
```

### Recipe 3: Append-Only Table

An event log that only receives INSERTs:

```sql
ALTER TABLE event_log SET (
  autovacuum_vacuum_scale_factor = 0,       -- Only use threshold
  autovacuum_vacuum_threshold = 0,          -- Effectively: always eligible
  autovacuum_freeze_max_age = 500000000,    -- Freeze less often (extend from 200M to 500M)
  autovacuum_vacuum_insert_threshold = 10000 -- Vacuum after 10K inserts (for freezing)
);
```

Since there are no dead tuples, vacuum mainly needs to run for XID freezing.

## Fillfactor: Enabling HOT Updates

The `fillfactor` storage parameter controls how full PostgreSQL fills each page:

```sql
ALTER TABLE frequently_updated SET (fillfactor = 80);
```

With `fillfactor = 80`, PostgreSQL leaves 20% free space on each page. This free space enables **HOT (Heap-Only Tuple) updates** — when an update does not change indexed columns, the new tuple version can be placed on the same page, avoiding index updates entirely.

```sql
-- Check HOT update effectiveness
SELECT
  relname,
  n_tup_upd,
  n_tup_hot_upd,
  CASE WHEN n_tup_upd > 0
    THEN round(100.0 * n_tup_hot_upd / n_tup_upd, 1)
    ELSE 0
  END AS hot_pct
FROM pg_stat_user_tables
WHERE relname = 'frequently_updated';
```

If `hot_pct` is low on a table with non-indexed column updates, lowering the fillfactor can dramatically reduce dead tuple generation and index bloat.

## Viewing Current Settings

### Check All Per-Table Settings

```sql
SELECT
  c.relname,
  c.reloptions,
  pg_size_pretty(pg_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND c.reloptions IS NOT NULL
ORDER BY c.relname;
```

### Compare Tuned vs Default Tables

```sql
SELECT
  c.relname,
  COALESCE(c.reloptions::TEXT, 'defaults') AS settings,
  s.n_dead_tup,
  s.n_live_tup,
  s.last_autovacuum,
  s.autovacuum_count
FROM pg_class c
JOIN pg_stat_user_tables s ON s.relname = c.relname
WHERE c.relkind = 'r'
ORDER BY s.n_dead_tup DESC;
```

## Resetting Per-Table Settings

To remove a per-table override and revert to global defaults:

```sql
-- Remove specific settings
ALTER TABLE hot_table RESET (
  autovacuum_vacuum_scale_factor,
  autovacuum_vacuum_threshold
);

-- Verify they're gone
SELECT relname, reloptions
FROM pg_class
WHERE relname = 'hot_table';
```

After RESET, the table uses the global `autovacuum_vacuum_scale_factor` and `autovacuum_vacuum_threshold` values.

## Monitoring Tuning Effectiveness

After changing autovacuum settings, monitor the results:

```sql
-- Reset statistics for a clean baseline
SELECT pg_stat_reset();

-- Wait some time, then check
SELECT
  relname,
  n_dead_tup,
  autovacuum_count,
  last_autovacuum,
  pg_size_pretty(pg_relation_size(relid)) AS table_size
FROM pg_stat_user_tables
WHERE relname IN ('hot_table', 'default_table')
ORDER BY relname;
```

What to look for:
- **Higher autovacuum_count** on tuned tables (more frequent, smaller vacuums)
- **Lower n_dead_tup** on tuned tables (less dead tuple accumulation)
- **Stable table_size** (good vacuum prevents bloat growth)

## Common Mistakes

### Setting scale_factor = 0 Without a Threshold

```sql
-- BAD: Autovacuum runs constantly
ALTER TABLE t SET (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 0
);
```

This means any single dead tuple triggers autovacuum. On an active table, autovacuum will run continuously, consuming a worker slot that could serve other tables.

### Disabling Autovacuum

```sql
-- DANGEROUS: Dead tuples will accumulate forever
ALTER TABLE t SET (autovacuum_enabled = false);
```

Only do this if you have a manual VACUUM schedule. Even then, XID anti-wraparound vacuums still run — but regular cleanup won't happen.

### Ignoring the Cost Settings

Lowering `autovacuum_vacuum_scale_factor` without adjusting cost settings means autovacuum runs more frequently but still works slowly each time. For truly high-churn tables, also set `autovacuum_vacuum_cost_delay = 0` to remove throttling.

## Key Takeaways

- Per-table autovacuum settings override global defaults via `ALTER TABLE SET (...)`
- High-churn tables benefit from low scale factor (0.01-0.05) and reduced cost delay
- Large, static tables need higher thresholds to avoid wasteful vacuum runs
- `fillfactor` below 100 enables HOT updates, reducing dead tuple generation
- Always monitor after tuning: check `n_dead_tup`, `autovacuum_count`, and table size
- Settings are stored in `pg_class.reloptions` and can be viewed and reset

> **Real-World Example (Spare)**
>
> At Spare, the `CurrentVehicleLocation` table is the **only table in production
> with custom autovacuum settings**: `autovacuum_vacuum_cost_delay=1` and
> `autovacuum_vacuum_cost_limit=2000`. This table tracks real-time vehicle
> positions and is updated constantly — every few seconds per active vehicle.
> The default autovacuum settings couldn't keep up with the churn, so aggressive
> tuning was applied to minimize dead tuple accumulation.
>
> **Try It Yourself**: Open Metabase and run:
> ```sql
> SELECT relname, reloptions,
>   pg_size_pretty(pg_total_relation_size(oid)) AS total_size
> FROM pg_class
> WHERE reloptions IS NOT NULL AND relkind = 'r';
> ```

In the next lesson, we will cover the most dangerous consequence of neglecting VACUUM: transaction ID wraparound.
