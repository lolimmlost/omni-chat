import { pgTable, text, timestamp, integer, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sessions } from './sessions.js';

// Message role enum
export const messageRoleEnum = pgEnum('message_role', [
  'visitor',
  'admin',
  'ai',
  'system'
]);

// Messages table
export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  delivered: integer('delivered').default(1).notNull(), // 1 = true, 0 = false
  seen: integer('seen').default(0).notNull(),
  seenAt: timestamp('seen_at', { withTimezone: true }),
  metadata: jsonb('metadata'), // For AI model info, token count, etc.
}, (table) => ({
  sessionTimestampIdx: index('idx_session_timestamp').on(table.sessionId, table.timestamp),
  sessionIdIdx: index('idx_session_id').on(table.sessionId),
}));

// Relations for messages
export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
}));

// Message roles constants
export const MessageRole = {
  VISITOR: 'visitor',
  ADMIN: 'admin',
  AI: 'ai',
  SYSTEM: 'system',
};
