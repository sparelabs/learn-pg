import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'check-autovacuum-threshold',
    lessonId: '',
    type: 'sql-query',
    title: 'Check Autovacuum Statistics',
    prompt:
      'A table called `high_churn` has been created with 1,000 rows and then 300 rows were updated, creating dead tuples. Query `pg_stat_user_tables` to check the autovacuum-related statistics for this table.\n\nReturn the columns: `relname`, `n_dead_tup`, `n_live_tup`, and `last_autovacuum`.',
    setupSql: `
      DROP TABLE IF EXISTS high_churn;
      CREATE TABLE high_churn (id SERIAL PRIMARY KEY, status TEXT, updated_at TIMESTAMP);
      INSERT INTO high_churn (status, updated_at)
      SELECT 'active', now()
      FROM generate_series(1, 1000);
      ANALYZE high_churn;
      UPDATE high_churn SET status = 'inactive', updated_at = now() WHERE id <= 300;
    `,
    hints: [
      'Query pg_stat_user_tables and filter WHERE relname = \'high_churn\'',
      'The columns n_dead_tup and n_live_tup show estimated dead and live tuple counts',
      'last_autovacuum shows when autovacuum last processed this table (may be NULL)',
    ],
    explanation:
      'pg_stat_user_tables is the primary view for monitoring VACUUM activity. n_dead_tup shows the estimated count of dead tuples waiting to be cleaned. With 300 updates on a 1,000-row table, you should see approximately 300 dead tuples. The autovacuum threshold formula (50 + 0.2 * 1000 = 250) means this table has crossed the threshold and is eligible for autovacuum.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['relname', 'n_dead_tup', 'n_live_tup', 'last_autovacuum'],
          },
        },
      },
    },
    order: 1,
    difficulty: 2,
  },
  {
    id: 'observe-dead-tuples',
    lessonId: '',
    type: 'sql-query',
    title: 'Observe Dead Tuple Count After Mass Update',
    prompt:
      'The `high_churn` table has had ALL of its 1,000 rows updated. Check how many dead tuples have accumulated by querying `n_dead_tup` from `pg_stat_user_tables`.\n\nReturn only the `n_dead_tup` column for the `high_churn` table.',
    setupSql: `
      DROP TABLE IF EXISTS high_churn;
      CREATE TABLE high_churn (id SERIAL PRIMARY KEY, status TEXT, updated_at TIMESTAMP);
      INSERT INTO high_churn (status, updated_at)
      SELECT 'active', now()
      FROM generate_series(1, 1000);
      ANALYZE high_churn;
      UPDATE high_churn SET status = 'processed', updated_at = now();
    `,
    hints: [
      'SELECT n_dead_tup FROM pg_stat_user_tables WHERE relname = \'high_churn\'',
      'After updating all 1,000 rows, n_dead_tup should show approximately 1,000',
    ],
    explanation:
      'After updating all 1,000 rows, each UPDATE creates one dead tuple (the old version) and one new live tuple. The n_dead_tup counter should show approximately 1,000 — one dead tuple for each updated row. This count is what autovacuum monitors to decide when to run.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['n_dead_tup'],
          },
        },
      },
    },
    order: 2,
    difficulty: 2,
  },
  {
    id: 'manual-vacuum',
    lessonId: '',
    type: 'sql-query',
    title: 'Run Manual VACUUM and Verify Cleanup',
    prompt:
      'The `high_churn` table has accumulated dead tuples from a mass update. Run `VACUUM` on the table and then check that the dead tuple count has been reduced.\n\nYour query should VACUUM the table and then SELECT `n_dead_tup` from `pg_stat_user_tables` for the `high_churn` table.',
    setupSql: `
      DROP TABLE IF EXISTS high_churn;
      CREATE TABLE high_churn (id SERIAL PRIMARY KEY, status TEXT, updated_at TIMESTAMP);
      INSERT INTO high_churn (status, updated_at)
      SELECT 'active', now()
      FROM generate_series(1, 1000);
      ANALYZE high_churn;
      UPDATE high_churn SET status = 'processed', updated_at = now();
    `,
    hints: [
      'You can run multiple statements: VACUUM high_churn; SELECT ...',
      'After VACUUM, n_dead_tup should drop to 0 (or very close)',
      'VACUUM reclaims dead tuple space for reuse within the table',
    ],
    explanation:
      'VACUUM scans the table for dead tuples and marks their space as available for reuse. After running VACUUM, pg_stat_user_tables.n_dead_tup drops to 0 because all dead tuples have been cleaned up. Note that VACUUM does not shrink the table file — it only makes the space available for new tuples.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['n_dead_tup'],
          },
        },
      },
    },
    order: 3,
    difficulty: 3,
  },
];
