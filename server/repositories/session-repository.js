import { eq, and, desc, gte } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { sessions, messages, SessionStatus } from '../db/schema/index.js';
import { nanoid } from 'nanoid';

export class SessionRepository {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Create a new session
   */
  async createSession(siteId, visitorInfo = {}) {
    const [session] = await this.db
      .insert(sessions)
      .values({
        id: nanoid(),
        siteId,
        status: SessionStatus.ACTIVE,
        visitorInfo,
        tags: [],
        flagged: 0,
      })
      .returning();

    return session;
  }

  /**
   * Get session by ID with messages
   */
  async getSession(sessionId) {
    const session = await this.db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.timestamp)],
        },
      },
    });

    return session || null;
  }

  /**
   * Get session without messages (lightweight)
   */
  async getSessionMetadata(sessionId) {
    const session = await this.db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    return session || null;
  }

  /**
   * Update session status
   */
  async updateStatus(sessionId, status) {
    const [updated] = await this.db
      .update(sessions)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updated || null;
  }

  /**
   * Update admin socket ID
   */
  async updateAdminSocket(sessionId, adminSocketId) {
    const [updated] = await this.db
      .update(sessions)
      .set({
        adminSocketId,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updated || null;
  }

  /**
   * Add notes to session
   */
  async updateNotes(sessionId, notes) {
    const [updated] = await this.db
      .update(sessions)
      .set({
        notes,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updated || null;
  }

  /**
   * Add tags to session
   */
  async updateTags(sessionId, tags) {
    const [updated] = await this.db
      .update(sessions)
      .set({
        tags: Array.isArray(tags) ? tags : [tags],
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updated || null;
  }

  /**
   * Flag session for review
   */
  async flagSession(sessionId, reason = '') {
    const [updated] = await this.db
      .update(sessions)
      .set({
        flagged: 1,
        flaggedReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updated || null;
  }

  /**
   * Submit feedback
   */
  async submitFeedback(sessionId, rating, comment = '') {
    const [updated] = await this.db
      .update(sessions)
      .set({
        feedbackRating: rating,
        feedbackComment: comment,
        feedbackSubmittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updated || null;
  }

  /**
   * Close session
   */
  async closeSession(sessionId) {
    const [updated] = await this.db
      .update(sessions)
      .set({
        status: SessionStatus.CLOSED,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning();

    return updated || null;
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions() {
    return await this.db.query.sessions.findMany({
      where: eq(sessions.status, SessionStatus.ACTIVE),
      orderBy: desc(sessions.createdAt),
    });
  }

  /**
   * Get sessions by site
   */
  async getSessionsBySite(siteId, limit = 50) {
    return await this.db.query.sessions.findMany({
      where: eq(sessions.siteId, siteId),
      orderBy: desc(sessions.createdAt),
      limit,
    });
  }

  /**
   * Get sessions waiting for human
   */
  async getWaitingHumanSessions() {
    return await this.db.query.sessions.findMany({
      where: eq(sessions.status, SessionStatus.WAITING_HUMAN),
      orderBy: desc(sessions.createdAt),
    });
  }

  /**
   * Get recent sessions (for admin dashboard)
   */
  async getRecentSessions(limit = 100) {
    return await this.db.query.sessions.findMany({
      orderBy: desc(sessions.createdAt),
      limit,
      with: {
        messages: {
          orderBy: (messages, { desc }) => [desc(messages.timestamp)],
          limit: 1, // Just get the last message
        },
      },
    });
  }

  /**
   * Get conversation context for AI (recent messages)
   */
  async getConversationContext(sessionId, messageLimit = 20) {
    const sessionMessages = await this.db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: desc(messages.timestamp),
      limit: messageLimit,
    });

    // Return in chronological order (oldest first)
    return sessionMessages.reverse();
  }

  /**
   * Delete old closed sessions (cleanup)
   */
  async deleteOldSessions(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const deleted = await this.db
      .delete(sessions)
      .where(
        and(
          eq(sessions.status, SessionStatus.CLOSED),
          gte(sessions.closedAt, cutoffDate)
        )
      )
      .returning();

    return deleted.length;
  }

  /**
   * Check if session exists
   */
  async exists(sessionId) {
    const session = await this.db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      columns: { id: true },
    });

    return !!session;
  }

  /**
   * Count sessions by status
   */
  async countByStatus(status) {
    const result = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.status, status));

    return result.length;
  }
}

// Export singleton instance
export const sessionRepository = new SessionRepository();
