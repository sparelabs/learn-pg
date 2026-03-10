import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'xmin-xmax-basics',
    lessonId: '',
    type: 'sql-query',
    title: 'Inspect xmin and xmax After INSERT',
    prompt:
      'A table called `test` has been created with one row (id=1, name=\'Alice\'). Query the table to see its `xmin` and `xmax` system columns alongside the regular columns. These hidden columns reveal the transaction IDs that created and (if applicable) deleted each tuple.',
    setupSql: `
      DROP TABLE IF EXISTS test;
      CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO test VALUES (1, 'Alice');
    `,
    hints: [
      'You can select system columns by name: SELECT xmin, xmax, * FROM ...',
      'System columns like xmin and xmax are not included in SELECT * — you must name them explicitly',
    ],
    explanation:
      'Every tuple in PostgreSQL has hidden system columns. `xmin` is the transaction ID that created the tuple (via INSERT or UPDATE). `xmax` is the transaction ID that deleted or updated it — 0 means the tuple is still live. After a plain INSERT, xmax is always 0.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['xmin', 'xmax'],
          },
        },
      },
    },
    order: 1,
    difficulty: 2,
  },
  {
    id: 'xmax-after-update',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe xmax After an UPDATE',
    prompt:
      'The table `test` has been created with a row (id=1, name=\'Alice\'), and then that row was updated to name=\'Bob\'. Query the table to see `xmin`, `xmax`, and all columns for the current (visible) row.\n\nNotice that xmin now shows the transaction that performed the UPDATE (not the original INSERT), and xmax is 0 because the new tuple version has not been deleted or updated.',
    setupSql: `
      DROP TABLE IF EXISTS test;
      CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO test VALUES (1, 'Alice');
      UPDATE test SET name = 'Bob' WHERE id = 1;
    `,
    hints: [
      'Use SELECT xmin, xmax, * FROM test WHERE id = 1',
      'You will only see the current (new) tuple — the old one is invisible to your transaction',
    ],
    explanation:
      'After an UPDATE, the old tuple gets its xmax set to the updating transaction\'s ID, making it invisible. A new tuple is created with xmin = the updating transaction\'s ID and xmax = 0. You only see the new tuple in a normal SELECT, but both tuples exist on disk. The old tuple is a "dead tuple" that VACUUM will eventually clean up.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['xmin', 'xmax', 'id', 'name'],
          },
        },
      },
    },
    order: 2,
    difficulty: 2,
  },
  {
    id: 'tuple-visibility-pageinspect',
    lessonId: '',
    type: 'sql-query',
    title: 'See All Tuple Versions with pageinspect',
    prompt:
      'The table `test` has one row that was inserted and then updated. Use the `pageinspect` extension to examine the raw page contents and see BOTH tuple versions — the dead one and the live one.\n\nQuery `heap_page_items(get_raw_page(\'test\', 0))` to select `t_xmin`, `t_xmax`, `t_ctid`, and `t_infomask` from page 0 of the table.',
    setupSql: `
      CREATE EXTENSION IF NOT EXISTS pageinspect;
      DROP TABLE IF EXISTS test;
      CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO test VALUES (1, 'Alice');
      UPDATE test SET name = 'Bob' WHERE id = 1;
    `,
    hints: [
      'Use: SELECT t_xmin, t_xmax, t_ctid, t_infomask FROM heap_page_items(get_raw_page(\'test\', 0))',
      'get_raw_page(\'test\', 0) reads page 0 of the table as raw bytes',
      'heap_page_items() parses a raw page and returns one row per tuple',
    ],
    explanation:
      'Unlike a normal SELECT, pageinspect shows ALL tuples on a page, including dead ones. You should see two rows: the original INSERT tuple (with t_xmax set to the UPDATE transaction) and the new UPDATE tuple (with t_xmax = 0). The t_ctid on the old tuple points to the new tuple\'s location, forming a version chain. The t_infomask bits encode the commit/abort status of the xmin and xmax transactions.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { min: 2 },
          columns: {
            required: ['t_xmin', 't_xmax', 't_ctid', 't_infomask'],
          },
        },
      },
    },
    order: 3,
    difficulty: 4,
    requiresSuperuser: true,
  },
];
