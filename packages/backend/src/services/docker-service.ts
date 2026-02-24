import Docker from 'dockerode';
import { Client } from 'pg';

const docker = new Docker();

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class DockerService {
  private containerName = 'learn-pg-postgres';
  private config: PostgresConfig = {
    host: 'localhost',
    port: 5433,
    user: 'learnpg',
    password: 'learnpg_dev',
    database: 'exercises'
  };

  async isDockerRunning(): Promise<boolean> {
    try {
      await docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async isContainerRunning(): Promise<boolean> {
    try {
      const container = docker.getContainer(this.containerName);
      const info = await container.inspect();
      return info.State.Running;
    } catch {
      return false;
    }
  }

  async startContainer(): Promise<void> {
    try {
      const container = docker.getContainer(this.containerName);
      await container.start();
      await this.waitForHealthy();
    } catch (error) {
      throw new Error(`Failed to start container: ${error}`);
    }
  }

  async stopContainer(): Promise<void> {
    try {
      const container = docker.getContainer(this.containerName);
      await container.stop();
    } catch (error) {
      throw new Error(`Failed to stop container: ${error}`);
    }
  }

  async waitForHealthy(timeoutMs: number = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const client = new Client(this.config);
        await client.connect();
        await client.query('SELECT 1');
        await client.end();
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('PostgreSQL container failed to become healthy');
  }

  async executeQuery(query: string, params?: any[], timeoutMs: number = 5000): Promise<any> {
    const client = new Client(this.config);
    try {
      await client.connect();

      // Set statement timeout
      await client.query(`SET statement_timeout = ${timeoutMs}`);

      const result = await client.query(query, params);
      return result;
    } finally {
      await client.end();
    }
  }

  async executeQueryWithSchema(query: string, schema: string, params?: any[], timeoutMs: number = 5000): Promise<any> {
    const client = new Client(this.config);
    try {
      await client.connect();
      await client.query(`SET statement_timeout = ${timeoutMs}`);
      await client.query(`SET search_path TO ${schema}`);
      const result = await client.query(query, params);
      return result;
    } finally {
      await client.end();
    }
  }

  async executeExplain(query: string, schema?: string, params?: any[]): Promise<any> {
    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ${query}`;
    if (schema) {
      const result = await this.executeQueryWithSchema(explainQuery, schema, params);
      return result.rows[0]['QUERY PLAN'];
    }
    const result = await this.executeQuery(explainQuery, params);
    return result.rows[0]['QUERY PLAN'];
  }

  async resetSchema(schema: string): Promise<void> {
    const client = new Client(this.config);
    try {
      await client.connect();
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`GRANT ALL ON SCHEMA ${schema} TO ${this.config.user}`);
    } finally {
      await client.end();
    }
  }

  async setupExercise(setupSql: string, schema: string = 'public'): Promise<void> {
    const client = new Client(this.config);
    try {
      await client.connect();

      // Reset schema to clean state
      await this.resetSchema(schema);

      // Set search path
      await client.query(`SET search_path TO ${schema}`);

      // Execute setup SQL
      await client.query(setupSql);
    } finally {
      await client.end();
    }
  }

  async getTableInfo(schema: string = 'public'): Promise<any[]> {
    const query = `
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname = $1
      ORDER BY tablename;
    `;
    const result = await this.executeQuery(query, [schema]);
    return result.rows;
  }

  async getIndexInfo(schema: string = 'public'): Promise<any[]> {
    const query = `
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = $1
      ORDER BY tablename, indexname;
    `;
    const result = await this.executeQuery(query, [schema]);
    return result.rows;
  }

  getConfig(): PostgresConfig {
    return { ...this.config };
  }
}

export const dockerService = new DockerService();
