---
title: Introduction to PostgreSQL
description: Learn what PostgreSQL is and why it's a powerful database system
estimatedMinutes: 20
---

# Introduction to PostgreSQL

PostgreSQL is a powerful, open-source object-relational database system with over 35 years of active development. It has earned a strong reputation for reliability, feature robustness, and performance.

## Key Features

### ACID Compliance
PostgreSQL is fully ACID compliant, meaning it guarantees:
- **Atomicity**: Transactions are all-or-nothing
- **Consistency**: Data integrity is maintained
- **Isolation**: Concurrent transactions don't interfere
- **Durability**: Committed data persists

### Rich Data Types
PostgreSQL supports a wide variety of data types:
- Numeric: `INTEGER`, `BIGINT`, `DECIMAL`, `NUMERIC`
- Text: `VARCHAR`, `TEXT`, `CHAR`
- Date/Time: `DATE`, `TIME`, `TIMESTAMP`, `INTERVAL`
- Boolean: `BOOLEAN`
- JSON: `JSON`, `JSONB`
- Arrays, geometric types, and more

### Advanced Features
- Full-text search
- Complex queries with CTEs and window functions
- Foreign data wrappers
- Extensibility (custom functions, data types)
- MVCC (Multi-Version Concurrency Control)

## Basic Concepts

### Tables
Tables are the fundamental structure for storing data. Each table has:
- **Columns**: Define what data can be stored (with data types)
- **Rows**: Individual records of data

### Schemas
Schemas are namespaces that contain database objects like tables, views, and functions. The default schema is `public`.

### Queries
SQL (Structured Query Language) is used to interact with PostgreSQL:
- `SELECT`: Retrieve data
- `INSERT`: Add new data
- `UPDATE`: Modify existing data
- `DELETE`: Remove data

## Your First Query

Let's start with a simple query to check the PostgreSQL version:

```sql
SELECT version();
```

This will return information about your PostgreSQL installation.

## Next Steps

In the following lessons, you'll learn:
1. Creating tables and inserting data
2. Writing SELECT queries
3. Filtering and sorting results
4. Joining tables

Ready to get started? Let's move on to the exercises!
