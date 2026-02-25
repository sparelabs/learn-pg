---
title: Checkpoints
description: Understand how checkpoints synchronize data files with WAL and why checkpoint tuning matters for performance
estimatedMinutes: 30
---

# Checkpoints

A checkpoint is a point in the WAL where PostgreSQL guarantees that all data files are up to date. Checkpoints limit how much WAL needs to be replayed during crash recovery — only WAL records after the last checkpoint need to be replayed.

## What Checkpoints Do

During a checkpoint, PostgreSQL:

1. **Writes all dirty pages** from shared buffers to their data files on disk
2. **Flushes those writes** to stable storage (fsync)
3. **Records the checkpoint location** in WAL
4. **Removes old WAL segments** that are no longer needed for recovery

This is an expensive operation — it forces all modified pages to disk. PostgreSQL spreads this work over time to minimize performance impact.

## Checkpoint Triggers

Checkpoints happen for three reasons:

### 1. Time-Based (checkpoint_timeout)
```sql
SHOW checkpoint_timeout;  -- Default: 5min
```
A checkpoint runs at least every `checkpoint_timeout` seconds.

### 2. WAL Volume-Based (max_wal_size)
```sql
SHOW max_wal_size;  -- Default: 1GB
```
A checkpoint is triggered when WAL volume since the last checkpoint approaches `max_wal_size`.

### 3. Manual
```sql
CHECKPOINT;
```
You can force a checkpoint with the `CHECKPOINT` command (requires superuser).

## Spread Checkpoints

To avoid a sudden burst of I/O, PostgreSQL spreads checkpoint writes over time:

```sql
SHOW checkpoint_completion_target;  -- Default: 0.9
```

This means PostgreSQL tries to complete the checkpoint within 90% of the `checkpoint_timeout` interval. If `checkpoint_timeout` is 5 minutes, dirty pages are written gradually over 4.5 minutes instead of all at once.

## Monitoring Checkpoints

The `pg_stat_bgwriter` view shows checkpoint statistics:

```sql
SELECT
  checkpoints_timed,    -- Checkpoints triggered by timeout
  checkpoints_req,      -- Checkpoints triggered by WAL volume or manual
  buffers_checkpoint,   -- Pages written during checkpoints
  buffers_backend,      -- Pages written by backend processes (bad — means bgwriter/checkpointer can't keep up)
  maxwritten_clean      -- Times bgwriter stopped because it wrote too many buffers
FROM pg_stat_bgwriter;
```

**checkpoints_req > checkpoints_timed** suggests you may need to increase `max_wal_size` — checkpoints are being forced by WAL volume before the timeout.

**buffers_backend > 0** means backend processes (handling your queries) had to write dirty pages themselves — the background writer couldn't keep up. This can cause latency spikes.

## Checkpoint Tuning

### For Write-Heavy Workloads

```sql
-- Allow more WAL before forcing a checkpoint
ALTER SYSTEM SET max_wal_size = '4GB';

-- Longer time between checkpoints (fewer, larger checkpoints)
ALTER SYSTEM SET checkpoint_timeout = '15min';

-- Spread the work over more time
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
```

### Trade-offs

| Setting | Higher Value | Lower Value |
|---------|-------------|-------------|
| max_wal_size | Fewer checkpoints, more WAL storage, longer recovery | More frequent checkpoints, less WAL, faster recovery |
| checkpoint_timeout | Less frequent I/O bursts, longer recovery | More frequent checkpoints, faster recovery |
| checkpoint_completion_target | Smoother I/O, slightly higher average | Burstier I/O, lower average |

## Recovery Time

Checkpoint frequency directly affects crash recovery time. If checkpoints are 15 minutes apart, recovery might need to replay up to 15 minutes of WAL. For most systems, this is acceptable (WAL replay is fast). For systems requiring minimal downtime, more frequent checkpoints reduce recovery time at the cost of higher I/O during normal operation.

## Key Takeaways

- Checkpoints flush all dirty pages to disk, creating a recovery starting point
- Triggered by time (`checkpoint_timeout`), WAL volume (`max_wal_size`), or manually (`CHECKPOINT`)
- Spread checkpoints smooth I/O using `checkpoint_completion_target` (default 0.9)
- Monitor with `pg_stat_bgwriter`: watch `checkpoints_timed` vs `checkpoints_req` ratio
- Higher `max_wal_size` and `checkpoint_timeout` = fewer checkpoints, but longer recovery time
- `buffers_backend > 0` indicates the background writer can't keep up

Next, we'll explore WAL tuning parameters including `synchronous_commit` and `full_page_writes`.
