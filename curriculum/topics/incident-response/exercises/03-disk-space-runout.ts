import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'find-bloated-table',
    lessonId: '',
    type: 'sql-query',
    title: 'Find the Bloated Table',
    prompt:
      'Disk space is running out. Query pg_stat_user_tables to find the largest tables along with their dead tuple counts. Return relname, the total relation size formatted with pg_size_pretty (aliased as total_size), and n_dead_tup. Order by pg_total_relation_size(relid) descending, limit to 5 rows.',
    setupSql: `
      DROP TABLE IF EXISTS audit_log;
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS products;

      -- Create the bloated table with autovacuum disabled
      CREATE TABLE audit_log (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE audit_log SET (autovacuum_enabled = false);

      -- Insert 20,000 rows
      INSERT INTO audit_log (action, entity_type, entity_id, payload, created_at)
      SELECT
        CASE (i % 4)
          WHEN 0 THEN 'create'
          WHEN 1 THEN 'update'
          WHEN 2 THEN 'delete'
          WHEN 3 THEN 'read'
        END,
        CASE (i % 3)
          WHEN 0 THEN 'user'
          WHEN 1 THEN 'order'
          WHEN 2 THEN 'product'
        END,
        (i % 1000) + 1,
        jsonb_build_object('field', 'value_' || i, 'timestamp', now()),
        now() - (random() * interval '30 days')
      FROM generate_series(1, 20000) i;

      -- Update every row 3 times to create dead tuples (autovacuum won't clean them)
      UPDATE audit_log SET payload = jsonb_set(payload, '{updated}', '"round1"');
      UPDATE audit_log SET payload = jsonb_set(payload, '{updated}', '"round2"');
      UPDATE audit_log SET payload = jsonb_set(payload, '{updated}', '"round3"');

      -- Create some normal tables for comparison
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT
      );
      INSERT INTO users SELECT i, 'user_' || i, 'user_' || i || '@example.com'
      FROM generate_series(1, 1000) i;
      ANALYZE users;

      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name TEXT,
        price NUMERIC(10,2)
      );
      INSERT INTO products SELECT i, 'product_' || i, round((random() * 100)::numeric, 2)
      FROM generate_series(1, 500) i;
      ANALYZE products;
    `,
    hints: [
      'Use pg_size_pretty(pg_total_relation_size(relid)) AS total_size',
      'The relid column in pg_stat_user_tables is the OID of the table',
      'ORDER BY pg_total_relation_size(relid) DESC LIMIT 5',
      'Look for the table with the highest n_dead_tup -- that is your culprit',
    ],
    explanation:
      'pg_stat_user_tables gives you a quick overview of table health. The n_dead_tup column shows how many dead tuples (from UPDATEs and DELETEs) have not been cleaned up by VACUUM. A table with a very high n_dead_tup relative to n_live_tup is bloated -- it is using far more disk space than it needs for its actual data. Combined with pg_total_relation_size(), you can identify which tables are consuming the most disk.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['relname', 'total_size', 'n_dead_tup'],
          },
          rowCount: { min: 1, max: 5 },
        },
      },
    },
    order: 1,
    difficulty: 5,
  },
  {
    id: 'confirm-no-vacuum',
    lessonId: '',
    type: 'sql-query',
    title: 'Confirm Autovacuum Is Not Running',
    prompt:
      "You suspect the audit_log table has never been vacuumed. Confirm this by querying pg_stat_user_tables for the audit_log table. Return relname, last_autovacuum, last_vacuum, n_dead_tup, and n_live_tup. Both last_autovacuum and last_vacuum should be NULL, confirming that no vacuum has ever run on this table.",
    setupSql: `
      DROP TABLE IF EXISTS audit_log;

      CREATE TABLE audit_log (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE audit_log SET (autovacuum_enabled = false);

      INSERT INTO audit_log (action, entity_type, entity_id, payload)
      SELECT
        'update', 'order', i % 1000,
        jsonb_build_object('field', 'value_' || i)
      FROM generate_series(1, 10000) i;

      -- Generate dead tuples
      UPDATE audit_log SET payload = jsonb_set(payload, '{round}', '"1"');
      UPDATE audit_log SET payload = jsonb_set(payload, '{round}', '"2"');
    `,
    hints: [
      "Query pg_stat_user_tables WHERE relname = 'audit_log'",
      'Select last_autovacuum and last_vacuum columns',
      'NULL values confirm that VACUUM has never run',
    ],
    explanation:
      'The last_autovacuum and last_vacuum columns in pg_stat_user_tables record when the table was last vacuumed (automatically or manually). NULL means it has never been vacuumed since the statistics were reset. Combined with a high n_dead_tup, this confirms that the table is accumulating bloat with no cleanup. The root cause here is that someone set autovacuum_enabled = false on this table.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['relname', 'last_autovacuum', 'last_vacuum', 'n_dead_tup', 'n_live_tup'],
          },
        },
      },
    },
    order: 2,
    difficulty: 4,
  },
  {
    id: 'fix-vacuum-and-tune',
    lessonId: '',
    type: 'sql-query',
    title: 'Vacuum and Fix the Configuration',
    prompt:
      "Fix the problem in two steps. First, run VACUUM on the audit_log table to reclaim the dead tuple space. Then, alter the table to re-enable autovacuum with aggressive settings: set autovacuum_vacuum_scale_factor to 0.05 and autovacuum_vacuum_threshold to 100. Finally, verify by querying pg_class for the table's reloptions. Return relname and reloptions from pg_class where relname = 'audit_log'.",
    setupSql: `
      DROP TABLE IF EXISTS audit_log;

      CREATE TABLE audit_log (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE audit_log SET (autovacuum_enabled = false);

      INSERT INTO audit_log (action, entity_type, entity_id, payload)
      SELECT
        'update', 'order', i % 1000,
        jsonb_build_object('field', 'value_' || i)
      FROM generate_series(1, 10000) i;

      -- Generate dead tuples
      UPDATE audit_log SET payload = jsonb_set(payload, '{round}', '"1"');
      UPDATE audit_log SET payload = jsonb_set(payload, '{round}', '"2"');
    `,
    hints: [
      'Run VACUUM audit_log; first to clean up dead tuples',
      'Then ALTER TABLE audit_log SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 100)',
      "Finally SELECT relname, reloptions FROM pg_class WHERE relname = 'audit_log'",
      'You can combine all three statements separated by semicolons',
    ],
    explanation:
      'The immediate fix is VACUUM to reclaim dead tuple space. But you also need to prevent recurrence by setting proper autovacuum parameters. A scale_factor of 0.05 means autovacuum triggers after 5% of rows become dead tuples (instead of the default 20%), and a threshold of 100 means it triggers after at least 100 dead tuples accumulate. Note that we removed autovacuum_enabled = false -- the new settings in reloptions will override the defaults. For high-churn tables, aggressive autovacuum settings are essential.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { exact: 1 },
          columns: {
            required: ['relname', 'reloptions'],
          },
        },
      },
    },
    order: 3,
    difficulty: 6,
  },
];
