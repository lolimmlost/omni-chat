import { pgTable, serial, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sessions } from './sessions.js';

// Page visits table for tracking user journey
export const pageVisits = pgTable('page_visits', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionTimestampIdx: index('idx_page_visits_session_timestamp').on(table.sessionId, table.timestamp),
}));

// Relations
export const pageVisitsRelations = relations(pageVisits, ({ one }) => ({
  session: one(sessions, {
    fields: [pageVisits.sessionId],
    references: [sessions.id],
  }),
}));
