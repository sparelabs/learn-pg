---
title: PostgreSQL Caching Architecture
description: Learn how PostgreSQL uses multiple layers of caching to improve query performance
estimatedMinutes: 50
---

# PostgreSQL Caching Architecture

Understanding PostgreSQL's caching system is crucial for optimizing database performance. PostgreSQL uses a multi-layered caching approach that can dramatically reduce disk I/O and speed up queries.

## The Multi-Layer Cache Hierarchy

PostgreSQL uses three main caching layers:

```
Application/Connection
         ↓
PostgreSQL Shared Buffers (shared_buffers)
         ↓
Operating System Cache (page cache)
         ↓
Physical Disk Storage
```

### Layer 1: Shared Buffers

The shared buffer cache is PostgreSQL's own memory cache, shared across all connections.

```sql
-- Check current setting
SHOW shared_buffers;
```

**Default**: Usually 128MB (too low for production)
**Recommended**: 15-25% of total system RAM

#### What Gets Cached?

- Table data pages (heap pages)
- Index pages
- Temporary tables and results
- Transaction metadata (visibility information)

Each page is 8KB by default. If `shared_buffers = 1GB`, that's space for ~131,000 pages.

#### How It Works

When PostgreSQL needs a page:

1. **Check shared buffers** - Is the page already in memory?
2. **If YES**: Read from memory (very fast, ~100ns)
3. **If NO**: Load from disk/OS cache into shared buffers

**Key Point**: Shared buffers provide consistent caching across all database connections. Every process sees the same cached data.

### Layer 2: Operating System Cache

When PostgreSQL reads from disk, the OS caches the file contents in its page cache.

**Size**: Usually most of the remaining RAM after PostgreSQL's allocation

**Characteristics**:
- Managed automatically by the OS kernel
- Shared across all applications
- Uses LRU (Least Recently Used) eviction
- Transparent to PostgreSQL

#### The Double-Caching Effect

When a page is in shared buffers, it's often ALSO in the OS cache:

```
[Shared Buffer] ← PostgreSQL reads here first (fastest)
       ↓ (if miss)
[OS Page Cache] ← OS provides this automatically (fast)
       ↓ (if miss)
[Physical Disk] ← Actual I/O operation (slowest)
```

This double caching is intentional and beneficial:
- Shared buffers give PostgreSQL control over what to cache
- OS cache catches overflow and provides additional capacity
- OS cache helps during PostgreSQL restart (warm cache)

### Layer 3: Disk Storage

Physical persistent storage (HDD or SSD):
- **HDD**: Sequential reads ~100MB/s, random reads ~100 IOPS, latency 5-10ms
- **SSD**: Sequential reads ~500MB/s, random reads ~10,000 IOPS, latency 0.1ms

This is why caching matters so much - disk is 10,000x-100,000x slower than memory.

## Configuration Parameters

### shared_buffers

The size of PostgreSQL's own cache.

```sql
-- View current setting
SHOW shared_buffers;

-- Common production settings
-- 4GB server:    shared_buffers = 1GB
-- 16GB server:   shared_buffers = 4GB
-- 64GB server:   shared_buffers = 16GB
```

**Setting in postgresql.conf**:
```
shared_buffers = 4GB
```

**Trade-offs**:
- **Too low**: More disk I/O, slower queries
- **Too high**: Less memory for OS cache, diminishing returns
- **Sweet spot**: 15-25% of RAM

Beyond 25%, PostgreSQL's buffer management overhead grows and you get better value from OS cache.

### effective_cache_size

This parameter **doesn't allocate memory** - it's a hint to the query planner about total cache available (shared buffers + OS cache).

```sql
SHOW effective_cache_size;
```

**Purpose**: Helps the planner estimate whether data will be in cache when deciding between index scans vs sequential scans.

**Setting guideline**:
```
effective_cache_size = (total_ram - dedicated_app_memory) * 0.75
```

Example for 16GB server with PostgreSQL as primary workload:
```
effective_cache_size = 12GB
```

If planner thinks data is cached, it favors index scans (random access is cheap if in cache). If it thinks data is on disk, it favors sequential scans.

### work_mem

Per-operation memory for sorts, hashes, and joins.

```sql
SHOW work_mem;  -- Default: 4MB (often too low)
```

This is **not** cache, but it's memory-related:
- Each sort or hash operation can use up to `work_mem`
- Complex queries might use `work_mem` many times
- If operation exceeds `work_mem`, it spills to disk (temp files)

**Setting**:
```sql
SET work_mem = '256MB';  -- Per-session or per-query
```

**Global setting formula**:
```
work_mem = (total_ram - shared_buffers) / (max_connections × 3)
```

But often set lower globally and increase for specific queries.

## How Caching Affects Query Performance

### Cold Cache vs Warm Cache

**Cold cache**: Database just started, buffers empty
**Warm cache**: Frequently accessed data in memory

Example timing differences:

```sql
-- Cold cache (first run after restart)
SELECT COUNT(*) FROM large_table;
-- Time: 2500ms (reading from disk)

-- Warm cache (second run)
SELECT COUNT(*) FROM large_table;
-- Time: 150ms (reading from cache)
```

16× faster with warm cache!

### Sequential Scan Caching

When performing a sequential scan:

```sql
SELECT * FROM users;  -- Full table scan
```

PostgreSQL reads the entire table into shared buffers (if space available). On subsequent scans, data is in cache.

**But**: Sequential scans can evict other cached data. PostgreSQL uses special buffer management for large scans to avoid cache pollution.

### Index Scan Caching

Indexes are heavily cached because:
- They're accessed frequently
- They're relatively small
- Random access pattern benefits greatly from caching

```sql
-- B-tree index on id
SELECT * FROM users WHERE id = 12345;
```

With cached index:
1. Index root page: in cache (0.1µs)
2. Index intermediate pages: in cache (0.1µs each)
3. Index leaf page: in cache (0.1µs)
4. Heap page fetch: might need disk read (10ms if not cached)

Total: ~10ms vs ~40ms if nothing cached

## Cache Usage Monitoring

### pg_buffercache Extension

Install this extension to see what's in shared buffers:

```sql
CREATE EXTENSION pg_buffercache;

-- Summary of buffer cache usage
SELECT
    c.relname,
    COUNT(*) AS buffers,
    pg_size_pretty(COUNT(*) * 8192) AS cached_size,
    ROUND(100.0 * COUNT(*) / (SELECT setting::int FROM pg_settings WHERE name='shared_buffers')::numeric, 2) AS percent_of_cache
FROM pg_buffercache b
    JOIN pg_class c ON b.relfilenode = pg_relation_filenode(c.oid)
WHERE b.reldatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND c.relname NOT LIKE 'pg_%'
GROUP BY c.relname
ORDER BY buffers DESC
LIMIT 20;
```

This shows which tables/indexes dominate your buffer cache.

### Buffer Cache Hit Ratio

The most important caching metric:

```sql
SELECT
    SUM(blks_hit) AS cache_hits,
    SUM(blks_read) AS disk_reads,
    ROUND(
        100.0 * SUM(blks_hit) / NULLIF(SUM(blks_hit) + SUM(blks_read), 0),
        2
    ) AS cache_hit_ratio
FROM pg_stat_database
WHERE datname = current_database();
```

**Interpretation**:
- **> 99%**: Excellent - almost all reads from cache
- **95-99%**: Good - some disk I/O
- **< 95%**: Poor - need more memory or better indexes

**Production target**: > 99% for OLTP workloads

### Per-Table Cache Statistics

```sql
SELECT
    schemaname,
    relname,
    heap_blks_read AS disk_reads,
    heap_blks_hit AS cache_hits,
    ROUND(
        100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0),
        2
    ) AS cache_hit_ratio
FROM pg_statio_user_tables
WHERE heap_blks_hit + heap_blks_read > 0
ORDER BY heap_blks_read DESC
LIMIT 20;
```

Tables with low cache hit ratios are candidates for:
- Increased shared_buffers
- Better indexes to reduce sequential scans
- Partitioning to reduce working set size

## Buffer Replacement Policies

PostgreSQL uses a **clock sweep algorithm** for buffer replacement (variant of LRU):

1. Each buffer has a usage count (0-5)
2. When page accessed, usage count incremented (up to 5)
3. When evicting, clock hand sweeps, decrementing counts
4. First buffer with count = 0 gets evicted

**Effect**: Frequently accessed pages stay cached, infrequently accessed pages get evicted.

### Buffer Ring Management

For large sequential scans, PostgreSQL uses a small "buffer ring" instead of filling shared buffers:

- Sequential scan: 256KB ring
- VACUUM: 256KB ring
- Bulk load: 16MB ring

**Reason**: Prevents large operations from evicting useful cached data.

```sql
-- This won't evict your cached indexes
VACUUM ANALYZE large_table;
```

## Caching and Physical I/O Patterns

### Read-Ahead and Prefetching

PostgreSQL and the OS both use read-ahead:

```sql
-- Sequential scan triggers read-ahead
SELECT * FROM logs ORDER BY created_at;
```

OS sees sequential access pattern and reads ahead (64KB-256KB), reducing I/O latency.

### Write Patterns and Dirty Buffers

Modified pages in shared buffers are marked "dirty":

```sql
UPDATE users SET last_login = NOW() WHERE id = 123;
```

- Page modified in shared buffers (fast)
- Marked dirty
- Written to WAL immediately (for durability)
- Background writer flushes dirty pages to disk
- Checkpoint process ensures all dirty pages written

**This means**: Writes are cached too, then flushed asynchronously.

## Cache Warming Strategies

After restart, cache is cold. Strategies to warm it:

### 1. Natural Warming

Just run your application. Active queries will gradually fill cache with hot data.

**Time**: Minutes to hours

### 2. Manual Warming

Run queries to load critical tables into cache:

```sql
-- Warm specific tables
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM orders;

-- Warm specific indexes
SELECT id FROM users WHERE email LIKE '%@%';  -- Uses email index
```

### 3. pg_prewarm Extension

Explicitly load tables/indexes into cache:

```sql
CREATE EXTENSION pg_prewarm;

-- Load entire table into cache
SELECT pg_prewarm('users');

-- Load specific index
SELECT pg_prewarm('users_email_idx');

-- Load into shared buffers only
SELECT pg_prewarm('products', 'buffer');

-- Load into OS cache only
SELECT pg_prewarm('products', 'read');
```

Can be scripted in startup scripts for critical tables.

## Key Takeaways

- PostgreSQL uses **multi-layer caching**: shared buffers, OS cache, disk
- **shared_buffers** should be 15-25% of RAM (1-16GB typical)
- **effective_cache_size** is a planner hint, not an allocation (50-75% of RAM)
- Target **> 99% cache hit ratio** for OLTP workloads
- Use **pg_buffercache** to see what's cached
- Monitor **pg_stat_database** and **pg_statio_user_tables** for cache metrics
- Large scans use buffer rings to avoid cache pollution
- Cache warming after restart can improve initial performance

Understanding caching is essential for:
- Sizing server memory appropriately
- Diagnosing performance issues
- Tuning configuration parameters
- Designing efficient schema and queries

In the next lesson, we'll explore buffer cache management in detail and learn how to monitor and optimize cache usage.
