import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'basic-row-number',
    lessonId: '',
    type: 'sql-query',
    title: 'Use ROW_NUMBER to Rank Employees',
    prompt: 'Write a query that shows each employee\'s name and salary, along with a row number ordered by salary descending. Include columns: name, salary, row_num.',
    setupSql: `
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        salary INTEGER NOT NULL
      );

      INSERT INTO employees (name, department, salary) VALUES
        ('Alice', 'Sales', 60000),
        ('Bob', 'Sales', 70000),
        ('Carol', 'Engineering', 80000),
        ('Dave', 'Engineering', 90000),
        ('Eve', 'Sales', 65000),
        ('Frank', 'Engineering', 85000);
    `,
    hints: [
      'Use ROW_NUMBER() OVER (...) to assign sequential numbers',
      'ORDER BY salary DESC to rank from highest to lowest',
      'Use AS row_num to name the column'
    ],
    explanation: 'ROW_NUMBER() assigns a unique sequential number to each row. Unlike regular ORDER BY which just sorts results, ROW_NUMBER() creates a numbered column you can use for pagination or filtering.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['name', 'salary', 'row_num'],
          exactMatch: false
        },
        rowCount: { exact: 6 }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'rank-with-ties',
    lessonId: '',
    type: 'sql-query',
    title: 'Understand RANK vs DENSE_RANK',
    prompt: 'Write a query showing name, score, and both RANK() and DENSE_RANK() ordered by score descending. Include columns: name, score, rank, dense_rank.',
    setupSql: `
      CREATE TABLE test_scores (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        score INTEGER NOT NULL
      );

      INSERT INTO test_scores (name, score) VALUES
        ('Alice', 95),
        ('Bob', 95),
        ('Carol', 90),
        ('Dave', 85),
        ('Eve', 85),
        ('Frank', 80);
    `,
    hints: [
      'Use RANK() OVER (ORDER BY score DESC)',
      'Use DENSE_RANK() OVER (ORDER BY score DESC)',
      'Notice how they handle ties differently'
    ],
    explanation: 'RANK() creates gaps after ties (1, 1, 3), while DENSE_RANK() continues sequentially (1, 1, 2). Use RANK() for competitive rankings like sports, DENSE_RANK() when you want continuous rankings.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['name', 'score', 'rank', 'dense_rank'],
          exactMatch: false
        },
        rowCount: { exact: 6 }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'partition-by-department',
    lessonId: '',
    type: 'sql-query',
    title: 'Rank Within Departments Using PARTITION BY',
    prompt: 'Write a query that ranks employees by salary within each department. Show: name, department, salary, dept_rank. Order results by department, then dept_rank.',
    setupSql: `
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        salary INTEGER NOT NULL
      );

      INSERT INTO employees (name, department, salary) VALUES
        ('Alice', 'Sales', 60000),
        ('Bob', 'Sales', 70000),
        ('Carol', 'Engineering', 80000),
        ('Dave', 'Engineering', 90000),
        ('Eve', 'Sales', 65000),
        ('Frank', 'Engineering', 85000);
    `,
    hints: [
      'Use RANK() OVER (PARTITION BY department ORDER BY salary DESC)',
      'PARTITION BY creates separate ranking groups',
      'Add ORDER BY department, dept_rank at the end of the query'
    ],
    explanation: 'PARTITION BY divides rows into groups, applying the window function separately to each group. This lets you rank employees within their department, with rankings resetting for each department.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['name', 'department', 'salary', 'dept_rank'],
          exactMatch: false
        },
        rowCount: { exact: 6 }
      }
    },
    order: 3,
    difficulty: 2
  },
  {
    id: 'running-total',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate Running Total with Window Function',
    prompt: 'Write a query showing each month\'s sales and the running total. Include columns: month, sales, running_total. Order by month.',
    setupSql: `
      CREATE TABLE monthly_sales (
        month DATE NOT NULL,
        sales INTEGER NOT NULL
      );

      INSERT INTO monthly_sales (month, sales) VALUES
        ('2024-01-01', 10000),
        ('2024-02-01', 15000),
        ('2024-03-01', 12000),
        ('2024-04-01', 18000);
    `,
    hints: [
      'Use SUM(sales) OVER (ORDER BY month)',
      'The ORDER BY in the OVER clause creates a cumulative sum',
      'This is different from a regular SUM() aggregate'
    ],
    explanation: 'Window functions with ORDER BY create cumulative calculations. SUM() OVER (ORDER BY month) adds up all sales from the first month through the current row, creating a running total.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['month', 'sales', 'running_total'],
          exactMatch: false
        },
        rowCount: { exact: 4 }
      }
    },
    order: 4,
    difficulty: 3
  },
  {
    id: 'top-n-per-group',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Top 2 Earners Per Department',
    prompt: 'Write a query that returns only the top 2 highest-paid employees in each department. Show: name, department, salary. Order by department, then salary descending.',
    setupSql: `
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        salary INTEGER NOT NULL
      );

      INSERT INTO employees (name, department, salary) VALUES
        ('Alice', 'Sales', 60000),
        ('Bob', 'Sales', 70000),
        ('Carol', 'Engineering', 80000),
        ('Dave', 'Engineering', 90000),
        ('Eve', 'Sales', 65000),
        ('Frank', 'Engineering', 85000),
        ('Grace', 'Sales', 55000),
        ('Henry', 'Engineering', 75000);
    `,
    hints: [
      'Use a CTE (WITH clause) to assign rankings with RANK() OVER (PARTITION BY department ORDER BY salary DESC)',
      'Filter the CTE results WHERE rank <= 2',
      'Common pattern: WITH ranked AS (...) SELECT ... FROM ranked WHERE ...'
    ],
    explanation: 'The "top N per group" pattern requires two steps: (1) use a window function in a CTE to rank rows within groups, (2) filter the CTE results to keep only top N ranks. This is a very common analytical query pattern.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['name', 'department', 'salary'],
          exactMatch: false
        },
        rowCount: { exact: 6 }
      }
    },
    order: 5,
    difficulty: 4
  },
  {
    id: 'ntile-quartiles',
    lessonId: '',
    type: 'sql-query',
    title: 'Divide Employees into Salary Quartiles',
    prompt: 'Write a query that divides employees into 4 salary quartiles (1=lowest, 4=highest). Show: name, salary, quartile. Order by salary ascending.',
    setupSql: `
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        salary INTEGER NOT NULL
      );

      INSERT INTO employees (name, salary) VALUES
        ('Alice', 45000),
        ('Bob', 50000),
        ('Carol', 55000),
        ('Dave', 60000),
        ('Eve', 65000),
        ('Frank', 70000),
        ('Grace', 75000),
        ('Henry', 80000);
    `,
    hints: [
      'Use NTILE(4) OVER (ORDER BY salary)',
      'NTILE divides rows into approximately equal groups',
      'Order by salary to see the quartile distribution'
    ],
    explanation: 'NTILE(n) divides rows into n approximately equal buckets. This is useful for creating percentiles, quartiles, or any equal-sized groups for analysis or segmentation.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['name', 'salary', 'quartile'],
          exactMatch: false
        },
        rowCount: { exact: 8 }
      }
    },
    order: 6,
    difficulty: 2
  },
  {
    id: 'compare-to-average',
    lessonId: '',
    type: 'sql-query',
    title: 'Compare Salary to Department Average',
    prompt: 'Write a query showing each employee\'s salary compared to their department average. Include: name, department, salary, dept_avg, diff_from_avg (salary minus department average). Order by department, then name.',
    setupSql: `
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        salary INTEGER NOT NULL
      );

      INSERT INTO employees (name, department, salary) VALUES
        ('Alice', 'Sales', 60000),
        ('Bob', 'Sales', 70000),
        ('Carol', 'Engineering', 80000),
        ('Dave', 'Engineering', 90000),
        ('Eve', 'Sales', 65000),
        ('Frank', 'Engineering', 85000);
    `,
    hints: [
      'Use AVG(salary) OVER (PARTITION BY department) for dept_avg',
      'Calculate diff_from_avg as: salary - AVG(salary) OVER (PARTITION BY department)',
      'Window functions preserve all rows while adding aggregate context'
    ],
    explanation: 'This demonstrates the key advantage of window functions over GROUP BY: you keep individual rows while adding aggregate context. Each employee sees their own salary alongside their department\'s average, enabling comparison.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['name', 'department', 'salary', 'dept_avg', 'diff_from_avg'],
          exactMatch: false
        },
        rowCount: { exact: 6 }
      }
    },
    order: 7,
    difficulty: 3
  },
  {
    id: 'percent-of-total',
    lessonId: '',
    type: 'sql-query',
    title: 'Calculate Percentage of Total Sales',
    prompt: 'Write a query showing each product\'s sales as a percentage of total sales. Include: product_name, sales, pct_of_total (rounded to 2 decimal places). Order by sales descending.',
    setupSql: `
      CREATE TABLE product_sales (
        product_name TEXT NOT NULL,
        sales INTEGER NOT NULL
      );

      INSERT INTO product_sales (product_name, sales) VALUES
        ('Widget A', 25000),
        ('Widget B', 15000),
        ('Widget C', 30000),
        ('Widget D', 10000);
    `,
    hints: [
      'Use SUM(sales) OVER () to get total across all rows (note: empty OVER clause)',
      'Calculate percentage: 100.0 * sales / SUM(sales) OVER ()',
      'Use ROUND(..., 2) for 2 decimal places'
    ],
    explanation: 'An empty OVER() clause (no PARTITION BY or ORDER BY) creates a window across all rows. This lets you calculate totals or other aggregates while keeping individual rows, perfect for percentage calculations.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['product_name', 'sales', 'pct_of_total'],
          exactMatch: false
        },
        rowCount: { exact: 4 }
      }
    },
    order: 8,
    difficulty: 3
  }
];
