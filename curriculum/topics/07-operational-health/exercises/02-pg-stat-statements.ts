import type { Exercise } from '@learn-pg/shared';

export const exercises: Exercise[] = [
  {
    id: 'enable-pg-stat-statements',
    lessonId: '',
    type: 'sql-query',
    title: 'Enable pg_stat_statements Extension',
    prompt: 'Write a query to create the pg_stat_statements extension if it does not already exist.',
    setupSql: '',
    hints: [
      'Use CREATE EXTENSION',
      'Use IF NOT EXISTS to avoid errors',
      'The extension name is pg_stat_statements'
    ],
    explanation: 'The pg_stat_statements extension must be created in each database where you want to track query statistics. It requires shared_preload_libraries to be configured in postgresql.conf.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          successMessage: 'Extension created or already exists'
        }
      }
    },
    order: 1,
    difficulty: 1
  },
  {
    id: 'top-queries-by-total-time',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Top Queries by Total Time',
    prompt: 'Write a query to find the top 10 queries by total execution time from pg_stat_statements. Return: queryid, calls, total_exec_time (rounded to 2 decimals), mean_exec_time (rounded to 2 decimals), and the first 80 characters of query as query_preview. Order by total_exec_time descending.',
    setupSql: `
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
      SELECT pg_stat_statements_reset();
      -- Simulate some queries
      SELECT pg_sleep(0.01);
      SELECT COUNT(*) FROM pg_class;
      SELECT COUNT(*) FROM pg_attribute;
    `,
    hints: [
      'Use pg_stat_statements view',
      'Use LEFT() or SUBSTRING() to get first 80 characters',
      'Use round() with ::numeric cast',
      'LIMIT 10'
    ],
    explanation: 'Queries with the highest total execution time have the greatest overall impact on database performance, even if individual executions are fast.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { max: 10 },
          columns: {
            required: ['queryid', 'calls', 'total_exec_time', 'mean_exec_time', 'query_preview']
          }
        }
      }
    },
    order: 2,
    difficulty: 2
  },
  {
    id: 'queries-with-high-io',
    lessonId: '',
    type: 'sql-query',
    title: 'Find Queries with High Disk I/O',
    prompt: 'Write a query to find queries that have read blocks from disk (shared_blks_read > 0). Return: queryid, shared_blks_read, shared_blks_hit, cache_hit_ratio (rounded to 2 decimals), and first 60 characters of query. Order by shared_blks_read descending, limit 10.',
    setupSql: `
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    `,
    hints: [
      'Filter WHERE shared_blks_read > 0',
      'Calculate cache_hit_ratio as 100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read)',
      'Use NULLIF for division by zero protection',
      'Use LEFT(query, 60) for query preview'
    ],
    explanation: 'Queries with high disk reads may benefit from better indexing, query optimization, or increased shared_buffers. A low cache hit ratio indicates the query is not using cached data effectively.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          rowCount: { max: 10 },
          columns: {
            required: ['queryid', 'shared_blks_read', 'shared_blks_hit', 'cache_hit_ratio', 'query']
          }
        }
      }
    },
    order: 3,
    difficulty: 3
  },
  {
    id: 'queries-using-temp-space',
    lessonId: '',
    type: 'sql-query',
    title: 'Identify Queries Using Temporary Disk Space',
    prompt: 'Write a query to find queries that have written temporary blocks (temp_blks_written > 0). Return: queryid, calls, temp_blks_written, temp_size_mb (calculated as temp_blks_written * 8192 / 1048576, rounded to 2 decimals), mean_exec_time (rounded to 2 decimals), and first 70 characters of query. Order by temp_blks_written descending.',
    setupSql: `
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    `,
    hints: [
      'Filter WHERE temp_blks_written > 0',
      'Block size is 8192 bytes (8KB)',
      'Convert to MB by dividing by 1048576',
      'Use round() for 2 decimal places'
    ],
    explanation: 'Temporary disk usage occurs when sorts, hashes, or other operations exceed work_mem. These queries may benefit from increased work_mem or query optimization.',
    validation: {
      strategy: 'result-match',
      rules: {
        strategy: 'result-match',
        rules: {
          columns: {
            required: ['queryid', 'calls', 'temp_blks_written', 'temp_size_mb', 'mean_exec_time', 'query']
          }
        }
      }
    },
    order: 4,
    difficulty: 3
  }
];
