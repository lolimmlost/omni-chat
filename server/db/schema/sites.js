import { pgTable, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

// Sites table for managing multiple integrated sites
export const sites = pgTable('sites', {
  id: text('id').primaryKey(), // Site identifier (e.g., 'appahouse', 'default')
  name: text('name').notNull(),
  enabled: integer('enabled').default(1).notNull(), // 1 = true, 0 = false
  aiProvider: text('ai_provider').notNull().default('ollama'), // ollama, openai, anthropic, openrouter
  aiModel: text('ai_model').notNull().default('llama3.2'),
  contextFile: text('context_file'), // Path to context markdown file
  features: jsonb('features').notNull().default({
    aiEnabled: true,
    conversationMemory: true,
    contentFiltering: false,
    webhooks: true,
  }),
  webhooks: jsonb('webhooks').default({
    url: '',
    events: [],
  }),
  branding: jsonb('branding').default({
    name: 'Support Chat',
    color: '#00d9ff',
  }),
  responseSettings: jsonb('response_settings').default({
    temperature: 0.7,
    maxTokens: 500,
    systemPromptPrefix: '',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
