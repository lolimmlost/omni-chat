import { pgTable, text, timestamp, jsonb, integer, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Session status enum
export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'waiting_human',
  'waiting_ai',
  'closed'
]);

// Sessions table
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  status: sessionStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  adminSocketId: text('admin_socket_id'),
  visitorInfo: jsonb('visitor_info'),
  notes: text('notes'),
  tags: jsonb('tags').default([]),
  feedbackRating: integer('feedback_rating'),
  feedbackComment: text('feedback_comment'),
  feedbackSubmittedAt: timestamp('feedback_submitted_at', { withTimezone: true }),
  flagged: integer('flagged').default(0), // 0 = false, 1 = true (boolean as int for compatibility)
  flaggedReason: text('flagged_reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  siteStatusIdx: index('idx_site_status').on(table.siteId, table.status),
  createdAtIdx: index('idx_created_at').on(table.createdAt),
  statusIdx: index('idx_status').on(table.status),
}));

// Relations for sessions
export const sessionsRelations = relations(sessions, ({ many }) => ({
  messages: many('messages'),
  pageVisits: many('pageVisits'),
  summary: many('conversationSummaries'),
}));

// Type inference
export const SessionStatus = {
  ACTIVE: 'active',
  WAITING_HUMAN: 'waiting_human',
  WAITING_AI: 'waiting_ai',
  CLOSED: 'closed',
};
