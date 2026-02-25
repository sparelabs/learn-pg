-- Create extensions for learning platform
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pageinspect;
CREATE EXTENSION IF NOT EXISTS pgstattuple;
CREATE EXTENSION IF NOT EXISTS pg_buffercache;

-- Create default database for exercises
CREATE DATABASE exercises OWNER learnpg;

-- Connect to exercises database and create extensions there too
\c exercises
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pageinspect;
CREATE EXTENSION IF NOT EXISTS pgstattuple;
CREATE EXTENSION IF NOT EXISTS pg_buffercache;

-- Create superuser role for exercises that need internals access
CREATE ROLE learnpg_admin WITH LOGIN SUPERUSER PASSWORD 'learnpg_admin_dev';
GRANT ALL PRIVILEGES ON DATABASE exercises TO learnpg_admin;
