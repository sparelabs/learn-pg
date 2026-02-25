---
title: Concurrency Anomalies
description: Understand dirty reads, non-repeatable reads, phantom reads, lost updates, and write skew with concrete examples
estimatedMinutes: 40
---

# Concurrency Anomalies

When multiple transactions run concurrently, various anomalies can occur. Understanding these anomalies — and which isolation levels prevent them — helps you choose the right isolation level and design correct concurrent code.

## Dirty Read

A dirty read occurs when a transaction reads data written by another transaction that has not yet committed.

**PostgreSQL prevents dirty reads at all isolation levels.** Even READ UNCOMMITTED is treated as READ COMMITTED in PostgreSQL, so you can never read uncommitted data.

```sql
-- Session A                          -- Session B
BEGIN;
INSERT INTO orders VALUES (999);
                                      SELECT * FROM orders WHERE id = 999;
                                      -- Returns 0 rows! The INSERT is not committed yet.
ROLLBACK;
                                      -- Good: Session B never saw the rolled-back row
```

## Non-Repeatable Read

A non-repeatable read occurs when a transaction reads the same row twice and gets different values because another transaction committed a change between the reads.

**READ COMMITTED allows this. REPEATABLE READ and SERIALIZABLE prevent it.**

```sql
-- Session A (READ COMMITTED)         -- Session B
BEGIN;
SELECT balance FROM accounts
WHERE id = 1;  -- Returns 1000
                                      UPDATE accounts SET balance = 500 WHERE id = 1;
                                      COMMIT;
SELECT balance FROM accounts
WHERE id = 1;  -- Returns 500! Different value.
COMMIT;
```

Under REPEATABLE READ, the second SELECT would still return 1000 because it uses the snapshot from the start of the transaction.

## Phantom Read

A phantom read occurs when a transaction re-executes a query and gets a different set of rows because another transaction inserted or deleted rows matching the query's condition.

**READ COMMITTED allows this. REPEATABLE READ in PostgreSQL also prevents it** (unlike the SQL standard which says phantoms are allowed at REPEATABLE READ — PostgreSQL is stricter).

```sql
-- Session A (READ COMMITTED)         -- Session B
BEGIN;
SELECT count(*) FROM orders
WHERE status = 'pending';  -- Returns 10
                                      INSERT INTO orders (status) VALUES ('pending');
                                      COMMIT;
SELECT count(*) FROM orders
WHERE status = 'pending';  -- Returns 11! New phantom row.
COMMIT;
```

## Lost Update

A lost update occurs when two transactions read a value, compute new values based on it, and both write — the second write overwrites the first without seeing it.

```sql
-- Session A                          -- Session B
BEGIN;                                BEGIN;
SELECT balance FROM accounts
WHERE id = 1;  -- Both see 1000
                                      SELECT balance FROM accounts
                                      WHERE id = 1;  -- Also sees 1000
UPDATE accounts
SET balance = 1000 + 100  -- +100
WHERE id = 1;
                                      UPDATE accounts
                                      SET balance = 1000 - 50  -- -50
                                      WHERE id = 1;
COMMIT;
                                      COMMIT;
-- Final balance: 950 (Session A's +100 is lost!)
```

### Preventing Lost Updates

Use `SELECT ... FOR UPDATE` to lock the row before reading:

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;  -- Locks the row
-- Other transactions trying to UPDATE or FOR UPDATE this row will wait
UPDATE accounts SET balance = balance + 100 WHERE id = 1;
COMMIT;
```

Or use atomic updates:

```sql
UPDATE accounts SET balance = balance + 100 WHERE id = 1;
-- This is atomic — no lost update possible
```

## Write Skew

Write skew occurs when two transactions each read data, make decisions based on what they read, and write — but the combination of their writes violates an invariant that neither individually violates.

```sql
-- Invariant: At least one doctor must be on-call
-- Session A                          -- Session B
BEGIN;                                BEGIN;
SELECT count(*) FROM doctors
WHERE on_call = true;  -- 2 on-call
                                      SELECT count(*) FROM doctors
                                      WHERE on_call = true;  -- 2 on-call
-- "2 on-call, safe to go off"        -- "2 on-call, safe to go off"
UPDATE doctors SET on_call = false
WHERE name = 'Alice';
                                      UPDATE doctors SET on_call = false
                                      WHERE name = 'Bob';
COMMIT;                               COMMIT;
-- Now 0 doctors on-call! Invariant violated.
```

Write skew is only prevented at the SERIALIZABLE isolation level. At lower levels, you need application-level checks or explicit locking.

## Summary: Anomalies vs Isolation Levels

| Anomaly | READ COMMITTED | REPEATABLE READ | SERIALIZABLE |
|---------|---------------|-----------------|--------------|
| Dirty Read | Prevented | Prevented | Prevented |
| Non-Repeatable Read | Possible | Prevented | Prevented |
| Phantom Read | Possible | Prevented (in PG) | Prevented |
| Lost Update | Possible | Error on conflict | Prevented |
| Write Skew | Possible | Possible | Prevented |

## Key Takeaways

- PostgreSQL never allows dirty reads — even READ UNCOMMITTED acts as READ COMMITTED
- Non-repeatable reads and phantom reads are allowed under READ COMMITTED but prevented under REPEATABLE READ
- Lost updates can be prevented with `SELECT ... FOR UPDATE` or atomic updates
- Write skew is the subtlest anomaly — only SERIALIZABLE prevents it automatically
- For most applications, READ COMMITTED + careful locking is sufficient
- When in doubt, use atomic updates (`SET balance = balance + 100`) instead of read-then-write patterns

Next, we'll explore PostgreSQL's locking mechanisms and deadlock detection.
