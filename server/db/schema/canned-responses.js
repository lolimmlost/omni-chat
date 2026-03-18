import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';

// Canned responses table
export const cannedResponses = pgTable('canned_responses', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  category: text('category').default('general'),
  usageCount: integer('usage_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// Category constants
export const CannedResponseCategory = {
  GENERAL: 'general',
  GREETING: 'greeting',
  CLOSING: 'closing',
  TROUBLESHOOTING: 'troubleshooting',
  ESCALATION: 'escalation',
};
