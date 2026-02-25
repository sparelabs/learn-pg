import type { Exercise } from '@learn-pg/shared';

const exercises: Exercise[] = [
  {
    id: 'caching-02-01',
    lessonId: 'caching-and-prepared-statements-02',
    type: 'sql-query',
    title: 'Calculate Database Cache Hit Ratio',
    prompt: 'Write a query to calculate the buffer cache hit ratio for the current database as a percentage. Include columns for cache_hits, disk_reads, and cache_hit_ratio_percent (rounded to 2 decimal places).',
    setupSql: null,
    hints: [
      'Query pg_stat_database',
      'Use blks_hit for cache hits and blks_read for disk reads',
      'Formula: 100.0 * blks_hit / (blks_hit + blks_read)',
      'Use ROUND(..., 2) for formatting',
      'Filter WHERE datname = current_database()'
    ],
    explanation: 'Cache hit ratio is the primary metric for cache performance. A ratio > 99% indicates that almost all page reads come from cache rather than disk, which is the target for OLTP workloads.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['cache_hits', 'disk_reads', 'cache_hit_ratio_percent'],
          exactMatch: false
        }
      }
    },
    order: 1,
    difficulty: 2
  },
  {
    id: 'caching-02-02',
    lessonId: 'caching-and-prepared-statements-02',
    type: 'sql-query',
    title: 'View Table-Level Cache Statistics',
    prompt: 'Write a query to show cache statistics for user tables. Include schemaname, relname (as table_name), heap_blks_read (as disk_reads), heap_blks_hit (as cache_hits), and the cache hit ratio as a percentage. Order by disk_reads descending and limit to 10 rows.',
    setupSql: `
      CREATE TABLE cache_test_1 (id int, data text);
      CREATE TABLE cache_test_2 (id int, data text);
      INSERT INTO cache_test_1 SELECT generate_series(1, 100), 'data';
      INSERT INTO cache_test_2 SELECT generate_series(1, 100), 'data';
      SELECT * FROM cache_test_1 WHERE id < 50;
      SELECT * FROM cache_test_2 WHERE id < 50;
    `,
    hints: [
      'Query pg_statio_user_tables',
      'Use heap_blks_read and heap_blks_hit',
      'Calculate ratio: 100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0)',
      'Use ORDER BY heap_blks_read DESC LIMIT 10'
    ],
    explanation: 'Table-level cache statistics help identify which tables are causing disk I/O. Tables with high disk reads and low cache ratios are candidates for optimization through indexing, partitioning, or configuration changes.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { max: 10 },
        columns: {
          required: ['table_name', 'disk_reads', 'cache_hits'],
          exactMatch: false
        }
      }
    },
    order: 2,
    difficulty: 3
  },
  {
    id: 'caching-02-03',
    lessonId: 'caching-and-prepared-statements-02',
    type: 'sql-query',
    title: 'Identify Tables with Low Cache Hit Ratios',
    prompt: 'Write a query to find user tables with a cache hit ratio below 95% and more than 100 total block reads. Show table_name, cache_hit_ratio (as percentage), and total_reads (sum of cache hits and disk reads). Order by cache_hit_ratio ascending.',
    setupSql: `
      CREATE TABLE low_cache_table (id int, data text);
      INSERT INTO low_cache_table SELECT generate_series(1, 1000), 'data';
      SELECT * FROM low_cache_table;
    `,
    hints: [
      'Query pg_statio_user_tables',
      'Calculate cache_hit_ratio: 100.0 * heap_blks_hit / NULLIF(heap_blks_hit + heap_blks_read, 0)',
      'Filter WHERE (heap_blks_hit + heap_blks_read) > 100',
      'Add another WHERE condition for ratio < 95',
      'Use HAVING if you calculate ratio in SELECT clause'
    ],
    explanation: 'Tables with low cache hit ratios (< 95%) are prime candidates for optimization. They may need better indexes, partitioning, or could indicate that the working set is larger than available cache.',
    validation: {
      strategy: 'result-match',
      rules: {
        columns: {
          required: ['table_name', 'cache_hit_ratio', 'total_reads'],
          exactMatch: false
        }
      }
    },
    order: 3,
    difficulty: 4
  },
  {
    id: 'caching-02-04',
    lessonId: 'caching-and-prepared-statements-02',
    type: 'sql-query',
    title: 'Analyze Index Cache Performance',
    prompt: 'Write a query to show index cache statistics. Include schemaname, relname (as table_name), indexrelname (as index_name), idx_blks_read (as disk_reads), idx_blks_hit (as cache_hits), and cache hit ratio as a percentage. Only show indexes with at least one access (cache hits or disk reads > 0). Order by disk_reads descending, limit to 10.',
    setupSql: `
      CREATE TABLE index_test (id int PRIMARY KEY, email text, name text);
      CREATE INDEX index_test_email_idx ON index_test(email);
      INSERT INTO index_test SELECT generate_series(1, 1000), 'user' || generate_series(1, 1000) || '@example.com', 'User' || generate_series(1, 1000);
      SELECT * FROM index_test WHERE id < 100;
      SELECT * FROM index_test WHERE email LIKE 'user1%';
    `,
    hints: [
      'Query pg_statio_user_indexes',
      'relname is the table name, indexrelname is the index name',
      'Use idx_blks_read and idx_blks_hit',
      'Filter WHERE idx_blks_hit + idx_blks_read > 0',
      'Calculate ratio and order by disk reads'
    ],
    explanation: 'Indexes should have very high cache hit ratios (> 99.5%) because they\'re accessed frequently and benefit greatly from caching. Low cache hit ratios on indexes may indicate the index is too large or poorly designed.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { max: 10 },
        columns: {
          required: ['table_name', 'index_name', 'disk_reads', 'cache_hits'],
          exactMatch: false
        }
      }
    },
    order: 4,
    difficulty: 3
  },
  {
    id: 'caching-02-05',
    lessonId: 'caching-and-prepared-statements-02',
    type: 'sql-query',
    title: 'Compare Table vs Index Caching',
    prompt: 'Write a query that shows separate cache hit ratios for tables vs indexes in the database. Show two rows: one for "tables" and one for "indexes" with columns: object_type, total_cache_hits, total_disk_reads, and cache_hit_ratio_percent.',
    setupSql: `
      CREATE TABLE compare_test (id int PRIMARY KEY, data text);
      CREATE INDEX compare_test_data_idx ON compare_test(data);
      INSERT INTO compare_test SELECT generate_series(1, 500), 'data' || generate_series(1, 500);
      SELECT * FROM compare_test WHERE id < 100;
      SELECT * FROM compare_test WHERE data LIKE 'data1%';
    `,
    hints: [
      'Use UNION ALL to combine table and index statistics',
      'First query: SELECT \'tables\' as object_type, SUM(heap_blks_hit), SUM(heap_blks_read) FROM pg_statio_user_tables',
      'Second query: SELECT \'indexes\' as object_type, SUM(idx_blks_hit), SUM(idx_blks_read) FROM pg_statio_user_indexes',
      'Calculate ratio in outer SELECT or in each sub-query'
    ],
    explanation: 'Comparing table vs index cache performance helps understand where cache is being used effectively. Typically, indexes should have higher cache hit ratios than tables because they\'re smaller and more frequently accessed.',
    validation: {
      strategy: 'result-match',
      rules: {
        rowCount: { exact: 2 },
        columns: {
          required: ['object_type', 'total_cache_hits', 'total_disk_reads', 'cache_hit_ratio_percent'],
          exactMatch: false
        }
      }
    },
    order: 5,
    difficulty: 5
  }
];

export { exercises };
