import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'set-aggressive-autovacuum',
    lessonId: '',
    type: 'sql-query',
    title: 'Set Aggressive Autovacuum on a Hot Table',
    prompt:
      'A high-churn table called `hot_table` receives thousands of updates per minute. Configure it for aggressive autovacuum by setting `autovacuum_vacuum_scale_factor` to 0.01 and `autovacuum_vacuum_threshold` to 100.\n\nThen verify the settings by querying `reloptions` from `pg_class` for the table.',
    setupSql: `
      DROP TABLE IF EXISTS hot_table;
      CREATE TABLE hot_table (
        id SERIAL PRIMARY KEY,
        session_data JSONB,
        last_seen TIMESTAMP DEFAULT now()
      );
      INSERT INTO hot_table (session_data, last_seen)
      SELECT
        jsonb_build_object('user_id', i, 'active', true),
        now() - (random() * interval '1 hour')
      FROM generate_series(1, 10000) i;
      ANALYZE hot_table;
    `,
    hints: [
      'Use ALTER TABLE hot_table SET (autovacuum_vacuum_scale_factor = 0.01, autovacuum_vacuum_threshold = 100)',
      'Then SELECT reloptions FROM pg_class WHERE relname = \'hot_table\'',
      'You can run both statements separated by a semicolon',
    ],
    explanation:
      'Per-table autovacuum settings are stored as storage parameters (reloptions) on the pg_class entry. With scale_factor = 0.01 and threshold = 100, autovacuum will trigger after just 100 + (0.01 * 10000) = 200 dead tuples, instead of the default 50 + (0.2 * 10000) = 2050. This means autovacuum runs 10x more frequently on this table, keeping dead tuple counts low.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['reloptions'],
          },
        },
      },
    },
    order: 1,
    difficulty: 3,
  },
  {
    id: 'compare-default-vs-tuned',
    lessonId: '',
    type: 'sql-query',
    title: 'Compare Default vs Tuned Autovacuum Settings',
    prompt:
      'Two tables have been created: `default_table` (using global autovacuum defaults) and `tuned_table` (with custom autovacuum settings). Query `pg_class` to compare their `reloptions` side by side.\n\nReturn `relname` and `reloptions` for both tables, ordered by `relname`.',
    setupSql: `
      DROP TABLE IF EXISTS default_table;
      DROP TABLE IF EXISTS tuned_table;
      CREATE TABLE default_table (id SERIAL PRIMARY KEY, data TEXT);
      CREATE TABLE tuned_table (id SERIAL PRIMARY KEY, data TEXT);
      INSERT INTO default_table (data) SELECT repeat('x', 50) FROM generate_series(1, 5000);
      INSERT INTO tuned_table (data) SELECT repeat('x', 50) FROM generate_series(1, 5000);
      ALTER TABLE tuned_table SET (
        autovacuum_vacuum_scale_factor = 0.02,
        autovacuum_vacuum_threshold = 50,
        autovacuum_vacuum_cost_delay = 0
      );
      ANALYZE default_table;
      ANALYZE tuned_table;
    `,
    hints: [
      'Query pg_class for both tables: WHERE relname IN (\'default_table\', \'tuned_table\')',
      'The default_table will have NULL reloptions (using global defaults)',
      'The tuned_table will show its custom settings in the reloptions array',
    ],
    explanation:
      'Tables without per-table overrides have NULL reloptions and use the global autovacuum settings. Tables with custom settings show them as a text array in reloptions. The tuned_table has a 2% scale factor (vs 20% default) and zero cost delay (vs 2ms default), meaning autovacuum runs much more frequently and without I/O throttling. This is appropriate for high-churn tables where keeping dead tuple counts low is more important than minimizing vacuum I/O.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 2 },
          columns: {
            required: ['relname', 'reloptions'],
          },
        },
      },
    },
    order: 2,
    difficulty: 3,
  },
];
