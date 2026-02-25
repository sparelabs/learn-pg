---
title: ACID and Isolation Levels
description: Deep dive into ACID properties, PostgreSQL's three isolation levels, and MVCC visibility rules
estimatedMinutes: 45
---

# ACID and Isolation Levels

Transactions are the foundation of database reliability. PostgreSQL provides strong ACID guarantees through its Multi-Version Concurrency Control (MVCC) implementation. Understanding how transactions work — and specifically how isolation levels control what concurrent transactions can see — is essential for writing correct concurrent applications.

## ACID Properties

**Atomicity**: A transaction either completes entirely or has no effect. If any statement fails, the entire transaction is rolled back.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;  -- Both updates happen, or neither does
```

**Consistency**: Transactions bring the database from one valid state to another. Constraints (NOT NULL, UNIQUE, FOREIGN KEY, CHECK) are enforced at commit time.

**Isolation**: Concurrent transactions don't interfere with each other. Each transaction sees a consistent snapshot of the database, as if it were running alone.

**Durability**: Once committed, a transaction's changes survive crashes. PostgreSQL achieves this through Write-Ahead Logging (WAL).

## PostgreSQL's Isolation Levels

PostgreSQL supports three isolation levels (it treats READ UNCOMMITTED as READ COMMITTED):

### READ COMMITTED (Default)

Each **statement** sees a snapshot of data committed before that statement began:

```sql
BEGIN;  -- Transaction starts
SELECT count(*) FROM orders;  -- Sees snapshot as of this moment
-- Another transaction inserts 10 rows and commits
SELECT count(*) FROM orders;  -- Sees the new rows! (new statement, new snapshot)
COMMIT;
```

Key behavior: Two SELECTs within the same transaction can return different results if another transaction commits between them. This is called a **non-repeatable read**.

### REPEATABLE READ

The entire transaction sees a snapshot from the moment the **first query** begins:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT count(*) FROM orders;  -- Snapshot taken here
-- Another transaction inserts 10 rows and commits
SELECT count(*) FROM orders;  -- Same count! (same snapshot)
COMMIT;
```

Key behavior: Consistent reads throughout the transaction. However, if you try to UPDATE a row that another transaction has already modified, you'll get a serialization error: `ERROR: could not serialize access due to concurrent update`.

### SERIALIZABLE

The strictest level. Guarantees that the result is the same as if transactions ran one at a time (serially):

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- PostgreSQL tracks read/write dependencies between transactions
-- If it detects a conflict that could violate serializability, it aborts one transaction
COMMIT;
```

Key behavior: May throw serialization errors (`ERROR: could not serialize access`). Applications must be prepared to retry transactions.

## MVCC: How Isolation Works

PostgreSQL doesn't use locks for reads (unlike many other databases). Instead, it uses **Multi-Version Concurrency Control**:

- Every row has `xmin` (transaction that created it) and `xmax` (transaction that deleted/updated it)
- Each transaction has a snapshot listing which transactions are visible to it
- A row is visible if its `xmin` transaction is committed and visible, and its `xmax` is not

This means **readers never block writers, and writers never block readers**. Only writer-writer conflicts require locks.

## Setting Isolation Levels

```sql
-- Per-transaction
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- Or set within an open transaction
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Per-session default
SET default_transaction_isolation = 'repeatable read';
```

## When to Use Each Level

| Level | Use When | Trade-off |
|-------|----------|-----------|
| READ COMMITTED | General OLTP (default) | Non-repeatable reads possible |
| REPEATABLE READ | Reports needing consistent snapshot | Serialization errors on conflicting writes |
| SERIALIZABLE | Critical data integrity (financial) | More serialization errors, slight overhead |

Most applications work fine with READ COMMITTED. Use REPEATABLE READ when you need consistent reads across a transaction (e.g., generating a report). Use SERIALIZABLE when you need absolute correctness guarantees and can handle retries.

## Key Takeaways

- ACID guarantees (Atomicity, Consistency, Isolation, Durability) are the foundation of transaction reliability
- PostgreSQL has three effective isolation levels: READ COMMITTED, REPEATABLE READ, and SERIALIZABLE
- MVCC means readers don't block writers — PostgreSQL uses row versioning instead of read locks
- READ COMMITTED (default) gives each statement a fresh snapshot
- REPEATABLE READ gives the entire transaction a consistent snapshot
- SERIALIZABLE prevents all anomalies but may require transaction retries

Next, we'll explore the specific concurrency anomalies each isolation level prevents (or allows).
