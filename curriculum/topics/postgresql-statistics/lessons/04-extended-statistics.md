---
title: Extended Statistics (Multivariate)
description: Learn about extended statistics for handling correlated columns and complex data patterns
estimatedMinutes: 30
---

# Extended Statistics (Multivariate)

PostgreSQL's basic statistics assume columns are independent. Extended statistics (introduced in PostgreSQL 10+) capture relationships between multiple columns, leading to much better query estimates for correlated data.

## The Independence Problem

By default, PostgreSQL assumes column values are statistically independent.

### Example Problem

```sql
-- Table: addresses
-- In USA, if state='CA' then country='USA' (always)
-- But planner doesn't know this!

EXPLAIN SELECT * FROM addresses
WHERE country = 'USA' AND state = 'CA';

-- Planner calculates:
-- selectivity = P(country='USA') × P(state='CA')
--             = 0.40 × 0.05
--             = 0.02 (2% of rows)

-- Reality: Everyone in CA is in USA, so it's just P(state='CA') = 5%
-- Estimate is off by 2.5×!
```

### Real-World Scenarios

Common cases where columns are correlated:
- **Geographic**: city + state + country
- **Temporal**: year + month + day
- **Hierarchical**: category + subcategory + product_type
- **Derived**: price + tax + total (functional dependency)

## Types of Extended Statistics

PostgreSQL supports four types of extended statistics:

1. **N-distinct (ndistinct)**: Distinct value combinations
2. **Dependencies (dependencies)**: Functional dependencies
3. **MCV (mcv)**: Multi-column most common values
4. **Expressions**: Statistics on expressions

## Creating Extended Statistics

### Basic Syntax

```sql
CREATE STATISTICS stat_name [(stat_types)]
ON column1, column2, ...
FROM table_name;
```

### Example: Geographic Correlation

```sql
-- Create statistics for correlated location columns
CREATE STATISTICS stats_location (dependencies, ndistinct, mcv)
ON city, state, country
FROM addresses;

-- Update the statistics
ANALYZE addresses;
```

## N-Distinct Statistics

Captures the number of distinct value combinations.

### Problem Without N-Distinct

```sql
-- Table: orders (1M rows)
-- country: 50 distinct values
-- state: 200 distinct values
-- Planner assumes: 50 × 200 = 10,000 distinct combinations

SELECT country, state, COUNT(*)
FROM orders
GROUP BY country, state;

-- Planner estimates: 10,000 groups
-- Reality: Only 200 groups (states are within countries)
```

### Solution

```sql
-- Create n-distinct statistics
CREATE STATISTICS stats_orders_location (ndistinct)
ON country, state
FROM orders;

ANALYZE orders;

-- Now planner knows there are only ~200 distinct combinations
-- GROUP BY estimates will be accurate
```

### Viewing N-Distinct Statistics

```sql
SELECT stxname, stxnamespace::regnamespace,
       stxrelid::regclass,
       stxkeys,
       stxdndistinct
FROM pg_statistic_ext
WHERE stxrelid = 'orders'::regclass;
```

## Functional Dependencies

Captures when one column's value determines another's.

### Problem Without Dependencies

```sql
-- If country='USA' then we know state is one of 50 US states
-- If state='CA' then we know country='USA' (deterministic!)

SELECT * FROM addresses
WHERE country = 'USA' AND state = 'CA';

-- Without dependencies:
-- Selectivity = P(country='USA') × P(state='CA') = 0.40 × 0.05 = 0.02

-- With dependencies:
-- Planner knows state='CA' → country='USA'
-- Selectivity = P(state='CA') = 0.05
```

### Creating Dependency Statistics

```sql
CREATE STATISTICS stats_addr_dep (dependencies)
ON city, state, country
FROM addresses;

ANALYZE addresses;

-- Now planner understands:
-- city → state → country (functional dependencies)
```

### Example: ZIP Code Dependencies

```sql
-- ZIP code determines city, state, country
CREATE STATISTICS stats_address_zip (dependencies)
ON zip_code, city, state, country
FROM addresses;

ANALYZE addresses;

-- Query with ZIP code
SELECT * FROM addresses WHERE zip_code = '94105';
-- Planner knows: zip_code determines all other location fields
-- No need to multiply selectivities
```

### Viewing Dependencies

```sql
SELECT stxname,
       stxrelid::regclass AS table,
       stxkeys AS column_numbers,
       stxddependencies AS dependencies
FROM pg_statistic_ext
WHERE stxrelid = 'addresses'::regclass;

-- Dependencies stored in internal format
-- Use EXPLAIN to see them in action
```

## Multi-Column MCV (Most Common Values)

Captures the most common combinations of values across multiple columns.

### Problem Without Multi-Column MCV

```sql
-- orders table
-- payment_method: {credit_card, paypal, bank_transfer}
-- status: {pending, completed, failed}

-- Most orders are: (credit_card, completed) - 60%
-- But planner assumes independent:
-- P(credit_card) × P(completed) = 0.70 × 0.80 = 0.56

SELECT * FROM orders
WHERE payment_method = 'credit_card' AND status = 'completed';
```

### Creating MCV Statistics

```sql
CREATE STATISTICS stats_orders_payment (mcv)
ON payment_method, status
FROM orders;

ANALYZE orders;

-- Now planner has MCV list for combinations:
-- (credit_card, completed): 60%
-- (paypal, completed): 18%
-- (credit_card, pending): 8%
-- ...
```

### MCV for Complex Queries

```sql
-- Create MCV for three correlated columns
CREATE STATISTICS stats_user_behavior (mcv)
ON device_type, browser, os
FROM user_sessions;

ANALYZE user_sessions;

-- Accurate estimates for queries like:
SELECT * FROM user_sessions
WHERE device_type = 'mobile'
  AND browser = 'safari'
  AND os = 'ios';
-- Planner uses MCV list instead of multiplying independent probabilities
```

### Viewing MCV Statistics

```sql
SELECT stxname,
       stxrelid::regclass,
       stxmcv
FROM pg_statistic_ext_data
WHERE stxoid IN (
  SELECT oid FROM pg_statistic_ext
  WHERE stxrelid = 'orders'::regclass
);
```

## Expression Statistics

Statistics on expressions, not just columns (PostgreSQL 14+).

### Creating Expression Statistics

```sql
-- Statistics on computed expression
CREATE STATISTICS stats_date_expression (mcv)
ON (EXTRACT(YEAR FROM order_date)),
   (EXTRACT(MONTH FROM order_date))
FROM orders;

ANALYZE orders;

-- Better estimates for:
SELECT * FROM orders
WHERE EXTRACT(YEAR FROM order_date) = 2024
  AND EXTRACT(MONTH FROM order_date) = 6;
```

### Common Use Cases

```sql
-- Case-insensitive text search
CREATE STATISTICS stats_email_lower (mcv, ndistinct)
ON (LOWER(email))
FROM users;

-- Date truncation
CREATE STATISTICS stats_created_date (mcv)
ON (DATE_TRUNC('month', created_at))
FROM events;

-- Complex expressions
CREATE STATISTICS stats_revenue (ndistinct)
ON (price * quantity * (1 - discount))
FROM order_items;
```

## Managing Extended Statistics

### Listing All Extended Statistics

```sql
SELECT s.stxname AS stat_name,
       n.nspname AS schema,
       c.relname AS table,
       s.stxkind AS stat_types,
       (SELECT array_agg(a.attname ORDER BY a.attnum)
        FROM unnest(s.stxkeys) AS k
        JOIN pg_attribute a ON a.attrelid = s.stxrelid AND a.attnum = k
       ) AS columns
FROM pg_statistic_ext s
JOIN pg_class c ON s.stxrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY c.relname, s.stxname;
```

### Dropping Extended Statistics

```sql
-- Drop statistics
DROP STATISTICS stats_location;

-- Drop if exists
DROP STATISTICS IF EXISTS stats_location;

-- Statistics are automatically dropped when table is dropped
```

### Updating Extended Statistics

```sql
-- Extended statistics are updated by ANALYZE
ANALYZE addresses;

-- Or analyze specific table
ANALYZE VERBOSE addresses;
-- Will show: "analyzing extended statistics for addresses"
```

## Performance Impact

### Storage Cost

```sql
-- Check size of extended statistics
SELECT stxname,
       pg_size_pretty(pg_relation_size(stxoid::regclass)) AS size
FROM pg_statistic_ext
WHERE stxrelid = 'orders'::regclass;

-- Typically small (few KB to few MB)
-- Much smaller than the table itself
```

### ANALYZE Cost

```sql
-- Extended statistics increase ANALYZE time
-- But usually negligible compared to benefits

-- Time without extended stats: 2 seconds
-- Time with 3 extended stats: 2.5 seconds

-- Always worth it for correlated columns
```

### Query Planning Cost

```sql
-- Minimal impact on planning time
-- Planner checks extended stats during estimation
-- Typically adds < 1ms to planning
```

## Best Practices

### When to Use Extended Statistics

1. **Correlated columns**: Geographic, hierarchical, temporal data
2. **Poor estimate accuracy**: EXPLAIN shows estimates far from actual
3. **Multi-column GROUP BY**: Inaccurate cardinality estimates
4. **Complex WHERE clauses**: Multiple correlated predicates

### When NOT to Use

1. **Independent columns**: No correlation between values
2. **Single-column queries**: Regular statistics are sufficient
3. **Small tables**: Overhead not worth it (< 10,000 rows)

### Statistics Type Selection

```sql
-- Use dependencies when:
-- - Clear functional relationships (state → country)
CREATE STATISTICS stats1 (dependencies) ON state, country FROM addresses;

-- Use ndistinct when:
-- - GROUP BY estimates are wrong
CREATE STATISTICS stats2 (ndistinct) ON category, brand FROM products;

-- Use mcv when:
-- - Specific value combinations are very common
CREATE STATISTICS stats3 (mcv) ON device, browser FROM sessions;

-- Use all three when:
-- - Complex correlations exist
CREATE STATISTICS stats4 (dependencies, ndistinct, mcv)
ON city, state, country FROM addresses;
```

### Monitoring Effectiveness

```sql
-- Before creating extended statistics
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
-- Note: estimated rows vs actual rows

-- After creating and analyzing
CREATE STATISTICS ...;
ANALYZE table;
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
-- Compare: estimates should be closer to actual
```

## Real-World Example

```sql
-- E-commerce orders table
-- Correlations:
-- - country + state + city
-- - payment_method + payment_status
-- - shipping_method + shipping_carrier

-- Create comprehensive statistics
CREATE STATISTICS stats_orders_location (dependencies, ndistinct, mcv)
ON country, state, city
FROM orders;

CREATE STATISTICS stats_orders_payment (mcv, dependencies)
ON payment_method, payment_status
FROM orders;

CREATE STATISTICS stats_orders_shipping (mcv)
ON shipping_method, shipping_carrier
FROM orders;

-- Update statistics
ANALYZE orders;

-- Now queries with these columns get accurate estimates:
EXPLAIN SELECT * FROM orders
WHERE country = 'USA'
  AND state = 'CA'
  AND city = 'San Francisco'
  AND payment_method = 'credit_card'
  AND payment_status = 'completed';
-- Estimates should be much more accurate!
```

## Troubleshooting

### Statistics Not Being Used

```sql
-- Check if statistics exist
SELECT * FROM pg_statistic_ext WHERE stxrelid = 'table_name'::regclass;

-- Ensure table was analyzed after creating statistics
SELECT last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'table_name';

-- If last_analyze is before statistics creation:
ANALYZE table_name;
```

### Estimates Still Wrong

```sql
-- Increase statistics target for base columns
ALTER TABLE orders ALTER COLUMN country SET STATISTICS 500;
ALTER TABLE orders ALTER COLUMN state SET STATISTICS 500;
ANALYZE orders;

-- Create more specific extended statistics
CREATE STATISTICS stats_detailed (dependencies, mcv, ndistinct)
ON country, state, city, zip_code
FROM addresses;
```

## Next Steps

In the next lesson, we'll explore how to configure and tune statistics collection parameters for optimal query performance.
