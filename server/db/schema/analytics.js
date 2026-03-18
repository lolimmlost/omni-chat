import { pgTable, serial, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

// Analytics events table
export const analyticsEvents = pgTable('analytics_events', {
  id: serial('id').primaryKey(),
  eventType: text('event_type').notNull(), // session_created, message_sent, ai_response, etc.
  sessionId: text('session_id'),
  siteId: text('site_id'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata'), // Event-specific data
}, (table) => ({
  eventTypeTimestampIdx: index('idx_event_type_timestamp').on(table.eventType, table.timestamp),
  siteTimestampIdx: index('idx_site_timestamp').on(table.siteId, table.timestamp),
  timestampIdx: index('idx_analytics_timestamp').on(table.timestamp),
}));

// Event types constants
export const EventType = {
  SESSION_CREATED: 'session_created',
  MESSAGE_SENT: 'message_sent',
  AI_RESPONSE: 'ai_response',
  AI_ERROR: 'ai_error',
  SESSION_CLOSED: 'session_closed',
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  MESSAGE_FILTERED: 'message_filtered',
  ADMIN_JOINED: 'admin_joined',
  WEBHOOK_SENT: 'webhook_sent',
};
