---
title: "Transaction Isolation Basics"
description: "See how concurrent transactions interact in PostgreSQL"
estimatedMinutes: 20
---

# Transaction Isolation Basics

PostgreSQL uses Multi-Version Concurrency Control (MVCC) to handle concurrent transactions. Each transaction sees a snapshot of the database, ensuring that uncommitted changes from other transactions are not visible by default.

## Read Committed (Default)

In the default `READ COMMITTED` isolation level, a transaction only sees data that has been committed before the query began. Uncommitted changes from other transactions are invisible.

This exercise uses two database sessions to demonstrate this behavior.
