import { pgTable, text, timestamp, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sessions } from './sessions.js';

// Sentiment enum
export const sentimentEnum = pgEnum('sentiment', ['positive', 'neutral', 'negative']);

// Conversation summaries table
export const conversationSummaries = pgTable('conversation_summaries', {
  sessionId: text('session_id').primaryKey().references(() => sessions.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  keyTopics: jsonb('key_topics').default([]), // Array of topic strings
  sentiment: sentimentEnum('sentiment').default('neutral'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  messageCount: integer('message_count').notNull(),
  model: text('model'), // Which AI model generated the summary
});

// Relations
export const conversationSummariesRelations = relations(conversationSummaries, ({ one }) => ({
  session: one(sessions, {
    fields: [conversationSummaries.sessionId],
    references: [sessions.id],
  }),
}));

// Sentiment constants
export const Sentiment = {
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
};
