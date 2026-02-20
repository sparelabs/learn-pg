import type { Exercise } from '@learn-pg/shared';

const exercises: Exercise[] = [
  {
    id: 'caching-03-01',
    lessonId: 'caching-and-prepared-statements-03',
    type: 'sql-query',
    title: 'Create a Simple Prepared Statement',
    prompt: 'Write a PREPARE statement named "get_product" that accepts an integer product ID and returns all columns from a products table where id matches the parameter.',
    setupSql: `
      CREATE TABLE products (id int PRIMARY KEY, name text, price numeric);
      INSERT INTO products VALUES (1, 'Widget', 19.99), (2, 'Gadget', 29.99), (3, 'Doohickey', 39.99);
    `,
    hints: [
      'Use PREPARE statement_name (param_types) AS ...',
      'Parameter type is int',
      'Use $1 as placeholder in the WHERE clause',
      'SELECT * FROM products WHERE id = $1'
    ],
    explanation: 'Prepared statements define a query template with parameter placeholders ($1, $2, etc.). The query is parsed once and can be executed multiple times with different parameter values.',
    validation: {
      strategy: 'result-match',
      rules: {
        // This exercise just tests if PREPARE worked - we'd check by executing it
        rowCount: { min: 0 }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'caching-03-02',
    lessonId: 'caching-and-prepared-statements-03',
    type: 'sql-query',
    title: 'Execute a Prepared Statement',
    prompt: 'After creating the prepared statement "get_product", execute it with product ID 2.',
    setupSql: `
      CREATE TABLE products (id int PRIMARY KEY, name text, price numeric);
      INSERT INTO products VALUES (1, 'Widget', 19.99), (2, 'Gadget', 29.99), (3, 'Doohickey', 39.99);
      PREPARE get_product (int) AS SELECT * FROM products WHERE id = $1;
    `,
    hints: [
      'Use EXECUTE statement_name(value)',
      'Pass 2 as the parameter'
    ],
    explanation: 'EXECUTE runs a prepared statement with specific parameter values. The query structure was already parsed during PREPARE, so only execution happens here.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 1 },
        columns: {
          required: ['id', 'name', 'price'],
          exactMatch: false
        },
        values: {
          exactMatch: [
            { id: 2, name: 'Gadget', price: '29.99' }
          ]
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'caching-03-03',
    lessonId: 'caching-and-prepared-statements-03',
    type: 'sql-query',
    title: 'Prepared Statement with Multiple Parameters',
    prompt: 'Create a prepared statement named "find_products" that accepts a minimum price (numeric) and a name pattern (text), and returns products where price >= $1 AND name ILIKE $2. Then execute it with min_price = 25.00 and pattern = \'%get%\'.',
    setupSql: `
      CREATE TABLE products (id int PRIMARY KEY, name text, price numeric);
      INSERT INTO products VALUES (1, 'Widget', 19.99), (2, 'Gadget', 29.99), (3, 'Doohickey', 39.99), (4, 'Super Gadget', 49.99);
    `,
    hints: [
      'PREPARE find_products (numeric, text) AS ...',
      'WHERE price >= $1 AND name ILIKE $2',
      'EXECUTE find_products(25.00, \'%get%\')'
    ],
    explanation: 'Multiple parameters are numbered sequentially ($1, $2, $3, etc.). The parameter types must match the values passed during execution.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 2 },
        columns: {
          required: ['id', 'name', 'price'],
          exactMatch: false
        }
      }
    },
    order: 3,
    difficulty: 3
  },
  {
    id: 'caching-03-04',
    lessonId: 'caching-and-prepared-statements-03',
    type: 'sql-query',
    title: 'View Prepared Statements',
    prompt: 'Write a query to display all currently prepared statements in the session. Show the name, statement, and parameter_types columns from pg_prepared_statements.',
    setupSql: `
      CREATE TABLE products (id int PRIMARY KEY, name text, price numeric);
      INSERT INTO products VALUES (1, 'Widget', 19.99), (2, 'Gadget', 29.99);
      PREPARE get_product (int) AS SELECT * FROM products WHERE id = $1;
      PREPARE find_expensive (numeric) AS SELECT * FROM products WHERE price > $1;
    `,
    hints: [
      'Query the pg_prepared_statements view',
      'SELECT name, statement, parameter_types FROM pg_prepared_statements'
    ],
    explanation: 'The pg_prepared_statements view shows all prepared statements in the current session, allowing you to inspect their definitions and monitor their usage.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { min: 2 },
        columns: {
          required: ['name', 'statement', 'parameter_types'],
          exactMatch: false
        }
      }
    },
    order: 4,
    difficulty: 2
  },
  {
    id: 'caching-03-05',
    lessonId: 'caching-and-prepared-statements-03',
    type: 'sql-query',
    title: 'Prepared INSERT Statement',
    prompt: 'Create a prepared statement named "insert_product" that inserts a new product with name (text) and price (numeric) parameters, and returns the inserted id. Then execute it to insert a product named "New Widget" with price 15.99.',
    setupSql: `
      CREATE TABLE products (id serial PRIMARY KEY, name text, price numeric);
      INSERT INTO products (name, price) VALUES ('Widget', 19.99), ('Gadget', 29.99);
    `,
    hints: [
      'PREPARE insert_product (text, numeric) AS ...',
      'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING id',
      'EXECUTE insert_product(\'New Widget\', 15.99)'
    ],
    explanation: 'Prepared statements work with INSERT, UPDATE, and DELETE as well as SELECT. Using RETURNING allows you to get back generated values like serial IDs.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 1 },
        columns: {
          required: ['id'],
          exactMatch: false
        }
      }
    },
    order: 5,
    difficulty: 3
  },
  {
    id: 'caching-03-06',
    lessonId: 'caching-and-prepared-statements-03',
    type: 'sql-query',
    title: 'Deallocate Prepared Statement',
    prompt: 'Query pg_prepared_statements to verify there are prepared statements, then deallocate a specific prepared statement named "get_product", and query pg_prepared_statements again to confirm it\'s gone.',
    setupSql: `
      CREATE TABLE products (id int PRIMARY KEY, name text, price numeric);
      PREPARE get_product (int) AS SELECT * FROM products WHERE id = $1;
      PREPARE find_expensive (numeric) AS SELECT * FROM products WHERE price > $1;
    `,
    hints: [
      'First SELECT COUNT(*) FROM pg_prepared_statements to see count',
      'Then DEALLOCATE get_product',
      'Then SELECT COUNT(*) FROM pg_prepared_statements again',
      'The second count should be 1 less'
    ],
    explanation: 'DEALLOCATE removes a prepared statement from the session. This is useful for cleaning up when you\'re done with a statement or if you want to redefine it.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 1 },
        columns: {
          required: ['count'],
          exactMatch: false
        }
      }
    },
    order: 6,
    difficulty: 2
  }
];

export { exercises };
