-- Connect to exercises database
\c exercises

-- Create schemas for organizing exercise content by topic
CREATE SCHEMA IF NOT EXISTS basics;
CREATE SCHEMA IF NOT EXISTS advanced_queries;
CREATE SCHEMA IF NOT EXISTS query_planner;
CREATE SCHEMA IF NOT EXISTS optimization;
CREATE SCHEMA IF NOT EXISTS statistics;
CREATE SCHEMA IF NOT EXISTS operational_health;
CREATE SCHEMA IF NOT EXISTS indexes;
CREATE SCHEMA IF NOT EXISTS performance;
CREATE SCHEMA IF NOT EXISTS advanced_topics;

-- Grant usage to learnpg user
GRANT ALL ON SCHEMA basics TO learnpg;
GRANT ALL ON SCHEMA advanced_queries TO learnpg;
GRANT ALL ON SCHEMA query_planner TO learnpg;
GRANT ALL ON SCHEMA optimization TO learnpg;
GRANT ALL ON SCHEMA statistics TO learnpg;
GRANT ALL ON SCHEMA operational_health TO learnpg;
GRANT ALL ON SCHEMA indexes TO learnpg;
GRANT ALL ON SCHEMA performance TO learnpg;
GRANT ALL ON SCHEMA advanced_topics TO learnpg;

-- Set default permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA basics GRANT ALL ON TABLES TO learnpg;
ALTER DEFAULT PRIVILEGES IN SCHEMA advanced_queries GRANT ALL ON TABLES TO learnpg;
ALTER DEFAULT PRIVILEGES IN SCHEMA query_planner GRANT ALL ON TABLES TO learnpg;
ALTER DEFAULT PRIVILEGES IN SCHEMA optimization GRANT ALL ON TABLES TO learnpg;
ALTER DEFAULT PRIVILEGES IN SCHEMA statistics GRANT ALL ON TABLES TO learnpg;
ALTER DEFAULT PRIVILEGES IN SCHEMA operational_health GRANT ALL ON TABLES TO learnpg;
ALTER DEFAULT PRIVILEGES IN SCHEMA indexes GRANT ALL ON TABLES TO learnpg;
ALTER DEFAULT PRIVILEGES IN SCHEMA performance GRANT ALL ON TABLES TO learnpg;
ALTER DEFAULT PRIVILEGES IN SCHEMA advanced_topics GRANT ALL ON TABLES TO learnpg;
