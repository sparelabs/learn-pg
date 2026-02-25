import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'column-size-comparison',
    lessonId: '',
    type: 'sql-query',
    title: 'Compare Column Sizes',
    prompt: 'A table with a short text column and a long text column has been created. Use pg_column_size() to compare the stored size of each column. Select pg_column_size(short_col) AS short_size and pg_column_size(long_col) AS long_size from the toast_test table.',
    setupSql: `
      DROP TABLE IF EXISTS toast_test;
      CREATE TABLE toast_test (
        id SERIAL PRIMARY KEY,
        short_col TEXT,
        long_col TEXT
      );
      INSERT INTO toast_test (short_col, long_col)
      VALUES (
        'hello world',
        repeat('This is a long text value that will be compressed by TOAST. ', 200)
      );
    `,
    hints: [
      'Use pg_column_size(column_name) to see stored size in bytes',
      'Select both pg_column_size(short_col) and pg_column_size(long_col)',
      'Alias them AS short_size and AS long_size'
    ],
    explanation: 'pg_column_size() shows how many bytes a value actually occupies in storage. Short values are stored inline, while long values are compressed and/or moved to a TOAST table. The long_col value is ~12,000 characters but will show a much smaller pg_column_size due to TOAST compression.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['short_size', 'long_size']
          }
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'observe-toast-table',
    lessonId: '',
    type: 'sql-query',
    title: 'Find the TOAST Table',
    prompt: 'A table with large text values has been created, which means it has an associated TOAST table. Query pg_class to find the TOAST relation. Join pg_class c with pg_class t on c.reltoastrelid = t.oid, filtering where c.relname = \'toast_test\'. Select c.relname and t.relname AS toast_relname.',
    setupSql: `
      DROP TABLE IF EXISTS toast_test;
      CREATE TABLE toast_test (
        id SERIAL PRIMARY KEY,
        body TEXT
      );
      INSERT INTO toast_test (body)
      SELECT repeat('x', 10000)
      FROM generate_series(1, 10) i;
    `,
    hints: [
      'Query pg_class and join it with itself using reltoastrelid',
      'c.reltoastrelid is the OID of the TOAST table',
      'Filter WHERE c.relname = \'toast_test\''
    ],
    explanation: 'Every table with toastable columns has an associated TOAST table in the pg_toast schema. The reltoastrelid column in pg_class links a table to its TOAST relation. TOAST tables store large values that exceed the ~2KB threshold, broken into chunks.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
          columns: {
            required: ['relname', 'toast_relname']
          }
        }
      }
    },
    order: 2,
    difficulty: 3
  },
  {
    id: 'toast-strategy',
    lessonId: '',
    type: 'sql-query',
    title: 'Change TOAST Storage Strategy',
    prompt: 'The toast_test table has a body column using the default EXTENDED strategy (compress + out-of-line). Change it to EXTERNAL (out-of-line without compression), insert a large value, then compare the stored size. Run: ALTER TABLE toast_test ALTER COLUMN body SET STORAGE EXTERNAL; then INSERT a row with repeat(\'x\', 10000) as body, and SELECT pg_column_size(body) AS body_size FROM toast_test ORDER BY id DESC LIMIT 1.',
    setupSql: `
      DROP TABLE IF EXISTS toast_test;
      CREATE TABLE toast_test (
        id SERIAL PRIMARY KEY,
        body TEXT
      );
      -- Insert with default EXTENDED strategy (compresses)
      INSERT INTO toast_test (body) VALUES (repeat('x', 10000));
    `,
    hints: [
      'ALTER TABLE toast_test ALTER COLUMN body SET STORAGE EXTERNAL',
      'Then INSERT INTO toast_test (body) VALUES (repeat(\'x\', 10000))',
      'Then SELECT pg_column_size(body) AS body_size FROM toast_test ORDER BY id DESC LIMIT 1',
      'EXTERNAL stores without compression so the size will be larger than EXTENDED'
    ],
    explanation: 'EXTERNAL storage skips compression and stores the value out-of-line directly. With EXTENDED (the default), a 10,000-byte string of repeated characters compresses very well. With EXTERNAL, the full uncompressed value is stored in the TOAST table. This is useful when you need fast substring access since the server doesn\'t need to decompress the entire value.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['body_size']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  }
];
