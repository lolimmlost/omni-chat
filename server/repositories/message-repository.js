import { eq, and, desc } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { messages, MessageRole } from '../db/schema/index.js';
import { nanoid } from 'nanoid';

export class MessageRepository {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Create a new message
   */
  async createMessage(sessionId, role, content, metadata = null) {
    const [message] = await this.db
      .insert(messages)
      .values({
        id: nanoid(),
        sessionId,
        role,
        content,
        metadata: metadata ? metadata : null,
        delivered: 1,
        seen: 0,
      })
      .returning();

    return message;
  }

  /**
   * Get message by ID
   */
  async getMessage(messageId) {
    const message = await this.db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });

    return message || null;
  }

  /**
   * Get messages for a session
   */
  async getMessagesBySession(sessionId, limit = null) {
    const query = this.db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: desc(messages.timestamp),
    });

    if (limit) {
      query.limit = limit;
    }

    const sessionMessages = await query;

    // Return in chronological order (oldest first)
    return sessionMessages.reverse();
  }

  /**
   * Mark message as seen
   */
  async markAsSeen(messageId) {
    const [updated] = await this.db
      .update(messages)
      .set({
        seen: 1,
        seenAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    return updated || null;
  }

  /**
   * Mark all messages in session as seen
   */
  async markAllAsSeen(sessionId) {
    const updated = await this.db
      .update(messages)
      .set({
        seen: 1,
        seenAt: new Date(),
      })
      .where(
        and(
          eq(messages.sessionId, sessionId),
          eq(messages.seen, 0)
        )
      )
      .returning();

    return updated;
  }

  /**
   * Get unread messages count for session
   */
  async getUnreadCount(sessionId) {
    const unread = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.sessionId, sessionId),
          eq(messages.seen, 0)
        )
      );

    return unread.length;
  }

  /**
   * Get last message for session
   */
  async getLastMessage(sessionId) {
    const [lastMessage] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.timestamp))
      .limit(1);

    return lastMessage || null;
  }

  /**
   * Get messages by role
   */
  async getMessagesByRole(sessionId, role) {
    return await this.db.query.messages.findMany({
      where: and(
        eq(messages.sessionId, sessionId),
        eq(messages.role, role)
      ),
      orderBy: desc(messages.timestamp),
    });
  }

  /**
   * Delete messages for a session (when session is deleted)
   */
  async deleteMessagesBySession(sessionId) {
    const deleted = await this.db
      .delete(messages)
      .where(eq(messages.sessionId, sessionId))
      .returning();

    return deleted.length;
  }

  /**
   * Count messages in session
   */
  async countMessages(sessionId) {
    const result = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId));

    return result.length;
  }

  /**
   * Convert message role from chat format to AI format
   * visitor -> user
   * admin/ai -> assistant
   */
  convertRoleForAI(role) {
    if (role === MessageRole.VISITOR) {
      return 'user';
    }
    if (role === MessageRole.ADMIN || role === MessageRole.AI) {
      return 'assistant';
    }
    return 'system';
  }

  /**
   * Get messages formatted for AI context
   */
  async getMessagesForAI(sessionId, limit = 20) {
    const sessionMessages = await this.getMessagesBySession(sessionId, limit);

    return sessionMessages
      .filter(m => m.role !== MessageRole.SYSTEM) // Skip system messages
      .map(m => ({
        role: this.convertRoleForAI(m.role),
        content: m.content,
        timestamp: m.timestamp,
      }));
  }
}

// Export singleton instance
export const messageRepository = new MessageRepository();
