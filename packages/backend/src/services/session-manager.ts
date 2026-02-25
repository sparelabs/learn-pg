import crypto from 'crypto';
import { Client } from 'pg';
import { dockerService } from './docker-service.js';

interface SessionPair {
  sessionA: Client;
  sessionB: Client;
  schema: string;
  exerciseId: string;
  createdAt: Date;
}

export class SessionManager {
  private sessions: Map<string, SessionPair> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up stale sessions every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create a pair of persistent connections for a multi-session exercise.
   * Each connection is its own pg.Client, so they have independent transaction state.
   * Returns a sessionId to reference this pair in subsequent requests.
   */
  async createSessionPair(exerciseId: string, schema: string, useSuperuser: boolean): Promise<string> {
    const config = useSuperuser ? dockerService.getAdminConfig() : dockerService.getConfig();
    const sessionA = new Client(config);
    const sessionB = new Client(config);
    await sessionA.connect();
    await sessionB.connect();
    await sessionA.query(`SET search_path TO ${schema}`);
    await sessionB.query(`SET search_path TO ${schema}`);
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, { sessionA, sessionB, schema, exerciseId, createdAt: new Date() });
    return sessionId;
  }

  async executeOnSession(sessionId: string, session: 'A' | 'B', query: string): Promise<any> {
    const pair = this.sessions.get(sessionId);
    if (!pair) throw new Error('Session not found');
    const client = session === 'A' ? pair.sessionA : pair.sessionB;
    return client.query(query);
  }

  async closeSessionPair(sessionId: string): Promise<void> {
    const pair = this.sessions.get(sessionId);
    if (pair) {
      await pair.sessionA.end().catch(() => {});
      await pair.sessionB.end().catch(() => {});
      this.sessions.delete(sessionId);
    }
  }

  private async cleanup(): Promise<void> {
    const maxAge = 30 * 60 * 1000; // 30 minutes
    for (const [id, pair] of this.sessions) {
      if (Date.now() - pair.createdAt.getTime() > maxAge) {
        await this.closeSessionPair(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    for (const [id] of this.sessions) {
      this.closeSessionPair(id);
    }
  }
}

export const sessionManager = new SessionManager();
