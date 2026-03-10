import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'measure-bloat',
    lessonId: '',
    type: 'sql-query',
    title: 'Measure Table Size After Mass Updates',
    prompt:
      'A table called `bloated_table` has been created with 50,000 rows and then every row was updated three times — creating massive dead tuple accumulation. Check the current table size using `pg_size_pretty(pg_relation_size(...))`.\n\nThis shows you how much space the table consumes, including all the dead tuples from the updates.',
    setupSql: `
      DROP TABLE IF EXISTS bloated_table;
      CREATE TABLE bloated_table (id SERIAL PRIMARY KEY, data TEXT, counter INTEGER DEFAULT 0);
      INSERT INTO bloated_table (data)
      SELECT repeat('payload_', 10) FROM generate_series(1, 50000);
      ANALYZE bloated_table;
      UPDATE bloated_table SET counter = counter + 1;
      UPDATE bloated_table SET counter = counter + 1;
      UPDATE bloated_table SET counter = counter + 1;
    `,
    hints: [
      'Use: SELECT pg_size_pretty(pg_relation_size(\'bloated_table\')) AS table_size',
      'The table should be much larger than expected for 50K rows due to dead tuples',
      'Each UPDATE creates a dead copy of every row, so 3 updates means ~150K dead tuples plus 50K live',
    ],
    explanation:
      'After three full-table updates, the table contains approximately 50,000 live tuples and 150,000 dead tuples. The table size reflects all of these — it is roughly 4x larger than necessary. This wasted space is "bloat." Even after VACUUM cleans the dead tuples, the file will remain this size because VACUUM only marks space for reuse, it does not shrink the file.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['table_size'],
          },
        },
      },
    },
    order: 1,
    difficulty: 2,
  },
  {
    id: 'pgstattuple-analysis',
    lessonId: '',
    type: 'sql-query',
    title: 'Precise Bloat Measurement with pgstattuple',
    prompt:
      'Use the `pgstattuple` extension to get precise bloat metrics for `bloated_table`. Query for `dead_tuple_count`, `dead_tuple_percent`, and `free_space`.\n\nThe pgstattuple function scans the entire table and reports exact dead tuple statistics, unlike the estimates in pg_stat_user_tables.',
    setupSql: `
      CREATE EXTENSION IF NOT EXISTS pgstattuple;
      DROP TABLE IF EXISTS bloated_table;
      CREATE TABLE bloated_table (id SERIAL PRIMARY KEY, data TEXT, counter INTEGER DEFAULT 0);
      INSERT INTO bloated_table (data)
      SELECT repeat('payload_', 10) FROM generate_series(1, 50000);
      ANALYZE bloated_table;
      UPDATE bloated_table SET counter = counter + 1;
      UPDATE bloated_table SET counter = counter + 1;
      UPDATE bloated_table SET counter = counter + 1;
    `,
    hints: [
      'Use: SELECT dead_tuple_count, dead_tuple_percent, free_space FROM pgstattuple(\'bloated_table\')',
      'pgstattuple() takes a table name and returns a single row with detailed space statistics',
      'dead_tuple_percent shows what fraction of the table is wasted on dead tuples',
    ],
    explanation:
      'pgstattuple provides exact measurements by scanning every page of the table. dead_tuple_count shows the precise number of dead tuples (should be around 150,000 after three full-table updates). dead_tuple_percent shows what fraction of the table space is wasted. free_space shows space that has been reclaimed by previous VACUUM runs (available for reuse). This is the most accurate way to measure bloat, but it requires a full table scan and superuser privileges.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['dead_tuple_count', 'dead_tuple_percent', 'free_space'],
          },
        },
      },
    },
    order: 2,
    difficulty: 4,
    requiresSuperuser: true,
  },
  {
    id: 'vacuum-vs-vacuum-full',
    lessonId: '',
    type: 'sql-query',
    title: 'Compare VACUUM vs VACUUM FULL on Table Size',
    prompt:
      'The `bloated_table` has been loaded and updated, creating significant bloat. First, run a regular `VACUUM` on the table and check its size. The size should remain roughly the same — VACUUM reclaims space for reuse but does not shrink the file.\n\nRun: `VACUUM bloated_table;` followed by `SELECT pg_size_pretty(pg_relation_size(\'bloated_table\')) AS size_after_vacuum;`\n\nNote: In a follow-up, you would run `VACUUM FULL bloated_table;` to see the table actually shrink. VACUUM FULL rewrites the entire table but takes an ACCESS EXCLUSIVE lock.',
    setupSql: `
      DROP TABLE IF EXISTS bloated_table;
      CREATE TABLE bloated_table (id SERIAL PRIMARY KEY, data TEXT, counter INTEGER DEFAULT 0);
      INSERT INTO bloated_table (data)
      SELECT repeat('payload_', 10) FROM generate_series(1, 50000);
      ANALYZE bloated_table;
      UPDATE bloated_table SET counter = counter + 1;
      UPDATE bloated_table SET counter = counter + 1;
      UPDATE bloated_table SET counter = counter + 1;
    `,
    hints: [
      'Run both statements: VACUUM bloated_table; SELECT pg_size_pretty(pg_relation_size(\'bloated_table\')) AS size_after_vacuum;',
      'The table size after VACUUM will be approximately the same as before — VACUUM does not shrink files',
      'VACUUM marks dead tuple space for reuse, but the file on disk does not get smaller',
    ],
    explanation:
      'Regular VACUUM marks dead tuple space as available for future inserts and updates, but it does not return that space to the operating system. The table file stays the same size. This is by design — VACUUM only needs a lightweight ShareUpdateExclusiveLock that does not block reads or writes. VACUUM FULL, by contrast, rewrites the entire table to a new file, compacting it to minimum size, but it takes an ACCESS EXCLUSIVE lock that blocks all access. In production, VACUUM FULL is rarely used; pg_repack is the preferred tool for online compaction.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['size_after_vacuum'],
          },
        },
      },
    },
    order: 3,
    difficulty: 3,
  },
];
