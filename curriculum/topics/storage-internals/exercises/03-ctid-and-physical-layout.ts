import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'ctid-basics',
    lessonId: '',
    type: 'sql-query',
    title: 'View Tuple CTIDs',
    prompt: 'Select the ctid (physical location) along with all columns from the test_table. Limit to 5 rows. The ctid column shows each tuple\'s (page, offset) address.',
    setupSql: `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        name TEXT,
        value INTEGER
      );
      INSERT INTO test_table
      SELECT i, 'item_' || i, i * 10
      FROM generate_series(1, 100) i;
    `,
    hints: [
      'Use SELECT ctid, * FROM table_name',
      'ctid is a system column available on every table',
      'Add LIMIT 5 to restrict output'
    ],
    explanation: 'Every tuple in PostgreSQL has a ctid — a (page_number, tuple_offset) pair that identifies its physical location. For example, (0,1) means page 0, item pointer 1. CTIDs change when rows are updated (MVCC creates a new physical copy) or when VACUUM reorganizes the table.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 5 },
          columns: {
            required: ['ctid']
          }
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'ctid-after-update',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe CTID Change After UPDATE',
    prompt: 'The test_table has a row with id=1. An UPDATE has already been executed on it (changing its value). Query the ctid and all columns for id=1 to see its new physical location. Notice the ctid is different from what it would be for a freshly inserted first row — the UPDATE created a new tuple version.',
    setupSql: `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        name TEXT,
        value INTEGER
      );
      INSERT INTO test_table VALUES (1, 'original', 100);
      INSERT INTO test_table VALUES (2, 'other', 200);
      -- Update row 1 so its ctid changes
      UPDATE test_table SET name = 'updated', value = 999 WHERE id = 1;
    `,
    hints: [
      'SELECT ctid, * FROM test_table WHERE id = 1',
      'The ctid won\'t be (0,1) anymore because the UPDATE created a new tuple',
      'The old tuple at the original ctid is now a dead tuple'
    ],
    explanation: 'When you UPDATE a row, PostgreSQL doesn\'t modify it in place. Instead, MVCC creates a new tuple version at a new physical location (new ctid). The old tuple is marked as dead (t_xmax is set) and remains until VACUUM removes it. This is why updates in PostgreSQL are more expensive than in databases that update in place.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['ctid']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'heap-page-items',
    lessonId: '',
    type: 'sql-query',
    requiresSuperuser: true,
    title: 'Inspect Raw Page Contents',
    prompt: 'Use the pageinspect extension to examine the raw contents of page 0 in test_table. Run: SELECT lp, lp_off, lp_len, t_xmin, t_xmax, t_ctid FROM heap_page_items(get_raw_page(\'test_table\', 0)) LIMIT 5. This shows the physical tuple layout including MVCC fields.',
    setupSql: `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        name TEXT
      );
      INSERT INTO test_table VALUES (1, 'first');
      INSERT INTO test_table VALUES (2, 'second');
      INSERT INTO test_table VALUES (3, 'third');
      UPDATE test_table SET name = 'updated_first' WHERE id = 1;
    `,
    hints: [
      'heap_page_items() returns one row per tuple on the page',
      'get_raw_page(\'table_name\', page_number) reads a raw page',
      'lp = line pointer, t_xmin/t_xmax = transaction visibility fields'
    ],
    explanation: 'heap_page_items() from the pageinspect extension reveals the raw physical contents of a heap page. Each row represents a tuple, showing its line pointer (lp), position within the page (lp_off, lp_len), and MVCC fields (t_xmin = inserting transaction, t_xmax = deleting/updating transaction, t_ctid = physical location or forwarding address).',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 1 },
          columns: {
            required: ['lp', 'lp_off', 'lp_len', 't_xmin', 't_xmax', 't_ctid']
          }
        }
      }
    },
    order: 3,
    difficulty: 4
  },
  {
    id: 'tuple-header',
    lessonId: '',
    type: 'sql-query',
    requiresSuperuser: true,
    title: 'Examine Tuple MVCC Headers',
    prompt: 'Inspect the MVCC header fields of tuples on page 0 of test_table. Select t_xmin, t_xmax, t_ctid, and t_infomask2 from heap_page_items(get_raw_page(\'test_table\', 0)). Look for tuples where t_xmax is non-zero — those are dead tuples from the UPDATE.',
    setupSql: `
      DROP TABLE IF EXISTS test_table;
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        name TEXT
      );
      INSERT INTO test_table VALUES (1, 'original');
      INSERT INTO test_table VALUES (2, 'keeper');
      UPDATE test_table SET name = 'modified' WHERE id = 1;
    `,
    hints: [
      'SELECT t_xmin, t_xmax, t_ctid, t_infomask2 FROM heap_page_items(get_raw_page(\'test_table\', 0))',
      't_xmax = 0 means the tuple is live (not deleted or updated)',
      't_xmax != 0 means another transaction deleted or updated this tuple',
      'LIMIT 5 to keep output manageable'
    ],
    explanation: 't_xmin is the transaction ID that created the tuple, and t_xmax is the transaction that invalidated it (via UPDATE or DELETE). For live tuples, t_xmax is 0. After an UPDATE, the old tuple has t_xmax set to the updating transaction\'s ID, and its t_ctid points to the new tuple version. This chain of pointers is how PostgreSQL implements MVCC versioning at the physical level.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['t_xmin', 't_xmax', 't_ctid']
          }
        }
      }
    },
    order: 4,
    difficulty: 4
  }
];
