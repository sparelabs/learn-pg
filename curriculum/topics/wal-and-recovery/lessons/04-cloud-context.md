---
title: Cloud Context
description: Understand WAL's role in replication, Point-in-Time Recovery, and cloud-managed PostgreSQL
estimatedMinutes: 25
---

# Cloud Context

WAL isn't just about crash recovery. It's the foundation for replication, Point-in-Time Recovery (PITR), and many cloud-managed database features. Understanding WAL's broader role helps you work effectively with managed PostgreSQL services.

## WAL and Replication

PostgreSQL replication works by streaming WAL records from a primary to one or more standbys:

```
Primary → WAL Stream → Standby
         (continuous)    (applies WAL records)
```

The standby continuously receives WAL records and applies them, maintaining a near-real-time copy of the primary. The gap between the primary's WAL position and the standby's applied position is **replication lag**.

```sql
-- On the primary: current WAL position
SELECT pg_current_wal_lsn();

-- Replication lag (if pg_stat_replication is available)
SELECT
  client_addr,
  state,
  sent_lsn,
  write_lsn,
  flush_lsn,
  replay_lsn,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes
FROM pg_stat_replication;
```

## Point-in-Time Recovery (PITR)

PITR lets you restore a database to any point in time, not just the last backup. It works by:

1. Taking a periodic **base backup** (a full copy of the data directory)
2. Archiving all WAL segments generated since the backup
3. To recover: restore the base backup, then replay WAL up to the desired time

```sql
-- The WAL position advances with every change
SELECT pg_current_wal_lsn();  -- 0/A000000
INSERT INTO important_data VALUES (...);
SELECT pg_current_wal_lsn();  -- 0/A0001F0

-- You could recover to any LSN between these two points
```

In practice, cloud-managed databases handle PITR automatically — you just specify a timestamp to restore to.

## Cloud-Managed Database Considerations

### Managed Recovery
Services like AWS RDS, Google Cloud SQL, and Azure Database for PostgreSQL handle:
- Automated base backups (daily snapshots)
- Continuous WAL archiving (to object storage like S3)
- PITR with configurable retention (typically 1-35 days)
- Automatic failover to standby replicas

You don't manage WAL segments or backup scripts — the service handles it.

### WAL and Storage
Cloud databases still generate WAL, and it affects:
- **Storage costs**: WAL archives consume storage (often to object storage, cheaper than block storage)
- **IOPS**: WAL writes consume I/O operations, counted toward your provisioned IOPS
- **Replication lag**: Network latency between availability zones adds to replication lag

### Logical Replication
WAL with `wal_level = logical` enables **logical replication** — streaming row-level changes that can be consumed by other systems:

```sql
-- Check WAL level
SHOW wal_level;  -- Should be 'logical' for CDC/logical replication
```

Logical replication enables:
- Cross-version upgrades (replicate from PG 14 to PG 16)
- Selective table replication
- Change Data Capture (CDC) for event streaming

## Replica Lag Explained

Replica lag occurs because:
1. Primary generates WAL records (microseconds)
2. WAL records are sent over the network (milliseconds)
3. Standby receives and writes WAL (milliseconds)
4. Standby replays WAL records (variable — depends on write load)

Heavy write loads on the primary can cause lag to increase if the standby can't replay fast enough. Long-running transactions on the standby can also prevent WAL replay (conflict between replay and active queries).

## Key Takeaways

- WAL is the foundation for replication — standbys receive and replay WAL records
- PITR (Point-in-Time Recovery) uses base backups + WAL archives to restore to any point
- Cloud-managed databases automate backup, archiving, and PITR
- Replication lag = time between primary WAL generation and standby WAL replay
- `wal_level = logical` enables logical replication and Change Data Capture
- WAL volume affects storage costs, IOPS, and replication lag in cloud environments

This completes our tour of WAL and recovery. You now understand how PostgreSQL ensures durability (WAL), how it manages recovery points (checkpoints), the tuning trade-offs (synchronous_commit, full_page_writes), and WAL's role in the broader ecosystem (replication, PITR, cloud).
