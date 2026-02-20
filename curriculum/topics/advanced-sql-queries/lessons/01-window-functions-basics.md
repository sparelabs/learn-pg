---
title: Window Functions Fundamentals
description: Learn the basics of window functions, ranking, and partitioning for powerful data analysis
estimatedMinutes: 55
---

# Window Functions Fundamentals

Window functions are one of PostgreSQL's most powerful features for data analysis. They allow you to perform calculations across sets of rows related to the current row, without collapsing the results like `GROUP BY` does.

## What Are Window Functions?

### The Problem with GROUP BY

Traditional aggregates collapse rows:

```sql
-- GROUP BY collapses rows
SELECT department, AVG(salary) as avg_salary
FROM employees
GROUP BY department;
```

**Result**:
```
department | avg_salary
-----------+-----------
Sales      | 65000
Engineering| 85000
```

**Lost information**: We can't see individual employees alongside the department average.

### Window Functions Keep All Rows

Window functions calculate across rows but **keep every row**:

```sql
-- Window function preserves all rows
SELECT
    name,
    department,
    salary,
    AVG(salary) OVER (PARTITION BY department) as dept_avg_salary
FROM employees;
```

**Result**:
```
name    | department  | salary | dept_avg_salary
--------+-------------+--------+----------------
Alice   | Sales       | 60000  | 65000
Bob     | Sales       | 70000  | 65000
Carol   | Engineering | 80000  | 85000
Dave    | Engineering | 90000  | 85000
```

**Key difference**: Every employee row preserved, with their department's average added.

## Window Function Syntax

```sql
function_name(...) OVER (
    [PARTITION BY partition_expression]
    [ORDER BY sort_expression]
    [frame_clause]
)
```

**Components**:
- `function_name`: The window function (ROW_NUMBER, RANK, SUM, etc.)
- `OVER`: Keyword that makes it a window function
- `PARTITION BY`: Optional - divides rows into groups
- `ORDER BY`: Optional - defines order within partition
- Frame clause: Optional - defines which rows to include (covered in advanced lesson)

## Basic Window Functions

### ROW_NUMBER() - Sequential Numbering

Assigns a unique sequential number to each row.

```sql
SELECT
    name,
    department,
    salary,
    ROW_NUMBER() OVER (ORDER BY salary DESC) as salary_rank
FROM employees;
```

**Result**:
```
name    | department  | salary | salary_rank
--------+-------------+--------+------------
Dave    | Engineering | 90000  | 1
Carol   | Engineering | 80000  | 2
Bob     | Sales       | 70000  | 3
Alice   | Sales       | 60000  | 4
```

**Use cases**:
- Pagination (get rows 11-20)
- Deduplication (keep first row per group)
- Sequential IDs

### RANK() - Ranking with Gaps

Assigns ranks with gaps when there are ties.

```sql
SELECT
    name,
    score,
    RANK() OVER (ORDER BY score DESC) as rank
FROM test_scores;
```

**Sample data**:
```
name    | score | rank
--------+-------+-----
Alice   | 95    | 1
Bob     | 95    | 1  -- Tied for 1st
Carol   | 90    | 3  -- Gap! (skips 2)
Dave    | 85    | 4
```

**Behavior**: Ties get the same rank, next rank skips numbers.

### DENSE_RANK() - Ranking without Gaps

Like RANK() but no gaps in rankings.

```sql
SELECT
    name,
    score,
    DENSE_RANK() OVER (ORDER BY score DESC) as dense_rank
FROM test_scores;
```

**Result**:
```
name    | score | dense_rank
--------+-------+-----------
Alice   | 95    | 1
Bob     | 95    | 1  -- Tied for 1st
Carol   | 90    | 2  -- No gap!
Dave    | 85    | 3
```

**Use case**: When you want continuous rankings (1st, 2nd, 3rd...) even with ties.

### NTILE(n) - Divide into Buckets

Divides rows into `n` approximately equal groups.

```sql
SELECT
    name,
    salary,
    NTILE(4) OVER (ORDER BY salary) as quartile
FROM employees;
```

**Result** (with 8 employees):
```
name    | salary | quartile
--------+--------+---------
Alice   | 45000  | 1  -- Bottom quartile
Bob     | 50000  | 1
Carol   | 55000  | 2
Dave    | 60000  | 2
Eve     | 65000  | 3
Frank   | 70000  | 3
Grace   | 75000  | 4  -- Top quartile
Henry   | 80000  | 4
```

**Use cases**:
- Quartiles, percentiles
- Splitting data for analysis
- Identifying top/bottom segments

## PARTITION BY - Grouping Within Windows

`PARTITION BY` divides rows into groups, applying the window function separately to each group.

### Without PARTITION BY

```sql
-- Ranks all employees globally
SELECT
    name,
    department,
    salary,
    RANK() OVER (ORDER BY salary DESC) as global_rank
FROM employees;
```

**Result**:
```
name    | department  | salary | global_rank
--------+-------------+--------+------------
Dave    | Engineering | 90000  | 1
Carol   | Engineering | 80000  | 2
Bob     | Sales       | 70000  | 3
Alice   | Sales       | 60000  | 4
```

### With PARTITION BY

```sql
-- Ranks employees within each department
SELECT
    name,
    department,
    salary,
    RANK() OVER (PARTITION BY department ORDER BY salary DESC) as dept_rank
FROM employees;
```

**Result**:
```
name    | department  | salary | dept_rank
--------+-------------+--------+----------
Dave    | Engineering | 90000  | 1  -- 1st in Engineering
Carol   | Engineering | 80000  | 2  -- 2nd in Engineering
Bob     | Sales       | 70000  | 1  -- 1st in Sales (reset!)
Alice   | Sales       | 60000  | 2  -- 2nd in Sales
```

**Key insight**: Ranking resets for each partition (department).

### Multiple Partitions

```sql
-- Rank employees by salary within department AND location
SELECT
    name,
    department,
    location,
    salary,
    RANK() OVER (
        PARTITION BY department, location
        ORDER BY salary DESC
    ) as rank_in_dept_location
FROM employees;
```

Partitions by the combination of department AND location.

## ORDER BY in Window Functions

`ORDER BY` within `OVER()` controls the order for the window calculation, independent of query results ordering.

### Impact on Rankings

```sql
-- Ascending order (lowest first)
SELECT
    name,
    salary,
    RANK() OVER (ORDER BY salary ASC) as rank_asc
FROM employees;

-- Descending order (highest first)
SELECT
    name,
    salary,
    RANK() OVER (ORDER BY salary DESC) as rank_desc
FROM employees;
```

### Multiple Sort Columns

```sql
SELECT
    name,
    department,
    years_employed,
    salary,
    ROW_NUMBER() OVER (
        PARTITION BY department
        ORDER BY years_employed DESC, salary DESC
    ) as seniority_rank
FROM employees;
```

**Sorting logic**: First by years_employed descending, then by salary descending for ties.

## Practical Examples

### Example 1: Top N Per Group

Find the top 2 highest-paid employees in each department:

```sql
WITH ranked_employees AS (
    SELECT
        name,
        department,
        salary,
        RANK() OVER (
            PARTITION BY department
            ORDER BY salary DESC
        ) as salary_rank
    FROM employees
)
SELECT name, department, salary
FROM ranked_employees
WHERE salary_rank <= 2;
```

**Pattern**: Use CTE with window function, filter in outer query.

### Example 2: Running Total

Calculate cumulative sales by month:

```sql
SELECT
    month,
    sales_amount,
    SUM(sales_amount) OVER (ORDER BY month) as running_total
FROM monthly_sales
ORDER BY month;
```

**Result**:
```
month   | sales_amount | running_total
--------+--------------+--------------
2024-01 | 10000        | 10000
2024-02 | 15000        | 25000  (10000 + 15000)
2024-03 | 12000        | 37000  (25000 + 12000)
```

### Example 3: Percent of Total

Calculate each product's percentage of total sales:

```sql
SELECT
    product_name,
    sales,
    ROUND(
        100.0 * sales / SUM(sales) OVER (),
        2
    ) as pct_of_total
FROM product_sales;
```

**Note**: `SUM(sales) OVER ()` without PARTITION BY or ORDER BY calculates total across all rows.

### Example 4: Deduplication

Keep only the most recent record per customer:

```sql
WITH ranked_records AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY customer_id
            ORDER BY created_at DESC
        ) as rn
    FROM customer_records
)
SELECT *
FROM ranked_records
WHERE rn = 1;
```

### Example 5: Comparing to Previous Row

Show sales vs. previous month (we'll use LAG in the advanced lesson, but can do it with joins):

```sql
SELECT
    month,
    sales,
    sales - LAG(sales) OVER (ORDER BY month) as change_from_prev_month
FROM monthly_sales;
```

**Result**:
```
month   | sales | change_from_prev_month
--------+-------+-----------------------
2024-01 | 10000 | NULL  (no previous)
2024-02 | 15000 | 5000  (15000 - 10000)
2024-03 | 12000 | -3000 (12000 - 15000)
```

## Window Functions vs GROUP BY

### When to Use GROUP BY

Use `GROUP BY` when you want **aggregated summary data**:

```sql
-- How many employees and average salary per department?
SELECT
    department,
    COUNT(*) as employee_count,
    AVG(salary) as avg_salary
FROM employees
GROUP BY department;
```

**Output**: One row per department.

### When to Use Window Functions

Use window functions when you want **individual rows WITH aggregate context**:

```sql
-- Each employee with their department's average
SELECT
    name,
    department,
    salary,
    AVG(salary) OVER (PARTITION BY department) as dept_avg,
    salary - AVG(salary) OVER (PARTITION BY department) as diff_from_avg
FROM employees;
```

**Output**: One row per employee, with department context.

### Can Combine Both

```sql
-- Department summaries with employee count ranking
SELECT
    department,
    COUNT(*) as employee_count,
    AVG(salary) as avg_salary,
    RANK() OVER (ORDER BY COUNT(*) DESC) as size_rank
FROM employees
GROUP BY department;
```

Apply window function to aggregated results!

## Common Pitfalls and Tips

### Pitfall 1: Forgetting ORDER BY

```sql
-- BAD: ROW_NUMBER without ORDER BY
SELECT
    name,
    ROW_NUMBER() OVER () as rn  -- Order is undefined!
FROM employees;
```

**Result**: Row numbers assigned, but in arbitrary order. Always specify ORDER BY for ranking functions.

### Pitfall 2: ORDER BY in Wrong Place

```sql
-- Window function ORDER BY
SELECT
    name,
    ROW_NUMBER() OVER (ORDER BY salary DESC) as rn
FROM employees
ORDER BY name;  -- Different ORDER BY for final results
```

**Two different ORDER BY clauses:**
- `OVER (ORDER BY salary DESC)`: For calculating row numbers
- `ORDER BY name`: For displaying final results

### Pitfall 3: Mixing Aggregates and Window Functions

```sql
-- ERROR: Can't mix regular aggregate with window function
SELECT
    department,
    COUNT(*),  -- Regular aggregate
    AVG(salary) OVER (PARTITION BY department)  -- Window function
FROM employees
GROUP BY department;
```

**Fix**: Use subquery or CTE to separate aggregation levels.

### Tip 1: Name Your Windows

For reusing the same window specification:

```sql
SELECT
    name,
    department,
    salary,
    RANK() OVER dept_window as dept_rank,
    DENSE_RANK() OVER dept_window as dept_dense_rank,
    AVG(salary) OVER dept_window as dept_avg
FROM employees
WINDOW dept_window AS (PARTITION BY department ORDER BY salary DESC);
```

**Benefit**: Cleaner code, consistency, easier maintenance.

### Tip 2: Use CTEs for Readability

```sql
WITH employee_ranks AS (
    SELECT
        name,
        department,
        salary,
        RANK() OVER (PARTITION BY department ORDER BY salary DESC) as dept_rank
    FROM employees
)
SELECT *
FROM employee_ranks
WHERE dept_rank <= 3;
```

Better than nested subqueries!

## Performance Considerations

### Window Functions Are Efficient

PostgreSQL optimizes window functions well. They typically require:
- One sort operation per unique window specification
- One pass through data

### Indexing Helps

Indexes on PARTITION BY and ORDER BY columns improve performance:

```sql
-- This query benefits from index on (department, salary)
SELECT
    name,
    RANK() OVER (PARTITION BY department ORDER BY salary DESC)
FROM employees;

-- Create helpful index
CREATE INDEX idx_emp_dept_sal ON employees(department, salary DESC);
```

### Multiple Window Functions

PostgreSQL optimizes multiple window functions with identical specifications:

```sql
-- Only one sort needed - same window spec used twice
SELECT
    name,
    RANK() OVER (ORDER BY salary DESC) as rank,
    DENSE_RANK() OVER (ORDER BY salary DESC) as dense_rank
FROM employees;
```

## Key Takeaways

- **Window functions preserve rows** (unlike GROUP BY which collapses)
- **Syntax**: `function() OVER (PARTITION BY ... ORDER BY ...)`
- **Ranking functions**: ROW_NUMBER (unique), RANK (gaps), DENSE_RANK (no gaps), NTILE (buckets)
- **PARTITION BY**: Creates separate groups for window calculations
- **ORDER BY**: Controls calculation order (different from query ORDER BY)
- **Use cases**: Rankings, running totals, comparisons, deduplication, percentiles
- **Window functions vs GROUP BY**: Use windows when you need individual rows with aggregate context
- **Performance**: Efficient with proper indexing on partition/order columns

Window functions unlock powerful analytical capabilities in SQL, enabling queries that would otherwise require multiple self-joins or application-side processing.

In the next lesson, we'll explore advanced window functions including aggregate windows, framing, LEAD/LAG for accessing other rows, and FIRST_VALUE/LAST_VALUE.
