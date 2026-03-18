# Omni-Chat AI Integration Enhancement

## Overview

This document details the major enhancements made to the Omni-Chat system, including:

- **PostgreSQL Database Integration** with Drizzle ORM
- **Multi-Provider AI Support** (Ollama, OpenAI, Anthropic, OpenRouter)
- **Conversation Memory** with AI-generated summaries
- **Content Filtering** system
- **Site-Specific Configuration** management

## Table of Contents

1. [Database Setup](#database-setup)
2. [AI Providers](#ai-providers)
3. [New Features](#new-features)
4. [Configuration](#configuration)
5. [Usage](#usage)
6. [Migration Guide](#migration-guide)

---

## Database Setup

### Prerequisites

- PostgreSQL server running on port **5438** (or configure in `.env`)
- Database named `omni_chat` (or configure in `.env`)

### Database Schema

The system now uses PostgreSQL with the following tables:

- **sessions** - Chat sessions with visitor info, status, feedback, tags
- **messages** - All messages with role, content, metadata
- **page_visits** - User journey tracking
- **conversation_summaries** - AI-generated conversation summaries
- **analytics_events** - Enhanced analytics with detailed metadata
- **sites** - Site configurations (AI provider, branding, features)
- **canned_responses** - Reusable response templates

### Running Migrations

```bash
# Generate migration files from schema
npm run db:generate

# Run migrations
npm run db:migrate

# Seed default data
npm run db:seed
```

### Database Studio

View and edit your database with Drizzle Studio:

```bash
npm run db:studio
```

This opens a web interface at `https://local.drizzle.studio`

---

## AI Providers

### Supported Providers

1. **Ollama** (Local, free)
2. **OpenAI** (GPT-4, GPT-3.5, etc.)
3. **Anthropic** (Claude Sonnet, Haiku)
4. **OpenRouter** (Access to multiple models)

### Provider Configuration

Each provider is configured via environment variables:

#### Ollama (Default)
```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

#### OpenAI
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

#### Anthropic
```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250514
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
```

#### OpenRouter
```env
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-3-5-sonnet
OPENROUTER_SITE_URL=https://yoursite.com
OPENROUTER_SITE_NAME=OmniChat
```

### Provider Features

All providers support:
- ✅ Streaming responses
- ✅ System prompts / context
- ✅ Temperature control
- ✅ Max token limits
- ✅ Retry logic with exponential backoff
- ✅ Error handling and categorization

---

## New Features

### 1. Conversation Memory

**What it does:**
- Automatically generates summaries after 10+ messages
- Includes summaries in AI context for better continuity
- Extracts key topics and sentiment
- Stores summaries in database for future reference

**How to enable:**
```javascript
// In site configuration
features: {
  conversationMemory: true
}
```

### 2. Multi-Provider Support

**What it does:**
- Switch between AI providers per site
- Automatic fallback if primary provider fails
- Per-site model configuration
- Provider health checking

**How to use:**
```javascript
// Different sites can use different providers
{
  "site1": {
    "aiProvider": "ollama",
    "aiModel": "llama3.2"
  },
  "site2": {
    "aiProvider": "anthropic",
    "aiModel": "claude-sonnet-4-5-20250514"
  }
}
```

### 3. Content Filtering

**What it does:**
- Blocks spam, malicious content, and inappropriate messages
- Optional PII detection
- Three modes: `block`, `flag`, `moderate`
- Configurable patterns per site

**How to enable:**
```javascript
// In site configuration
features: {
  contentFiltering: true
}
```

### 4. Site-Specific Contexts

**What it does:**
- Each site can have custom AI personality/instructions
- Supports markdown files in `/contexts/` directory
- Automatic caching (5-minute TTL)
- Fallback to default context

**How to add:**
1. Create `/contexts/yoursite.md`
2. Set `contextFile: "yoursite.md"` in site config
3. Restart server or wait for cache to refresh

---

## Configuration

### Environment Variables

Complete `.env` file structure:

```env
# Server
PORT=3100
NODE_ENV=development

# Admin
ADMIN_TOKEN=your-secret-token

# Database
DATABASE_URL=postgresql://user:password@localhost:5438/omni_chat
DB_HOST=localhost
DB_PORT=5438
DB_USER=user
DB_PASSWORD=password
DB_NAME=omni_chat
DB_SSL=false
DB_MAX_CONNECTIONS=20
DB_MIN_CONNECTIONS=2
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=10000

# Feature Flags
USE_DATABASE=true
MULTI_PROVIDER=true
CONTENT_FILTERING=false
CONVERSATION_MEMORY=true

# AI Providers (see above for details)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5-20250514
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-3-5-sonnet

# Webhooks
WEBHOOK_URL=
WEBHOOK_EVENTS=waiting_human,new_session
DASHBOARD_URL=https://chat.yoursite.com/admin

# CORS
ALLOWED_ORIGINS=https://yourdomain.com

# Logging
LOG_LEVEL=info
```

### Site Configuration (Database)

Sites are now configured in the database. Default sites are seeded automatically:

- **default** - Fallback configuration
- **appahouse** - Example site configuration

To add new sites:

```javascript
// Use the site repository
import { siteRepository } from './server/repositories/index.js';

await siteRepository.createSite({
  id: 'mysite',
  name: 'My Website',
  enabled: 1,
  aiProvider: 'anthropic',
  aiModel: 'claude-sonnet-4-5-20250514',
  contextFile: 'mysite.md',
  features: {
    aiEnabled: true,
    conversationMemory: true,
    contentFiltering: false,
    webhooks: true,
  },
  branding: {
    name: 'My Site Chat',
    color: '#4A90E2',
  },
  responseSettings: {
    temperature: 0.7,
    maxTokens: 600,
  },
});
```

---

## Usage

### Starting the Server

```bash
# Install dependencies (if not done)
npm install

# Run migrations
npm run db:migrate

# Seed default data
npm run db:seed

# Start server
npm start
```

### Checking Provider Status

```javascript
import { checkAllProviders } from './server/ai/factory.js';

const status = await checkAllProviders();
console.log(status);
// {
//   ollama: { configured: true, available: true, message: "..." },
//   openai: { configured: false, available: false, ... },
//   ...
// }
```

### Using AI Providers

```javascript
import { getProvider, ProviderType } from './server/ai/index.js';
import { ConversationManager } from './server/ai/conversation-manager.js';

// Get provider for a site
const provider = getProvider(ProviderType.ANTHROPIC);

// Create conversation manager
const manager = new ConversationManager(provider);

// Generate response
const response = await manager.generateResponse(sessionId, siteConfig);
```

### Using Repositories

```javascript
import {
  sessionRepository,
  messageRepository,
  analyticsRepository,
  siteRepository,
} from './server/repositories/index.js';

// Create session
const session = await sessionRepository.createSession('mysite', {
  browser: 'Chrome',
  os: 'Mac OS',
  referrer: 'https://google.com',
});

// Add message
const message = await messageRepository.createMessage(
  session.id,
  'visitor',
  'Hello, I need help!',
  null
);

// Log analytics
await analyticsRepository.logEvent('message_sent', {
  sessionId: session.id,
  siteId: 'mysite',
  metadata: { messageLength: message.content.length },
});

// Get site config
const siteConfig = await siteRepository.getSiteOrDefault('mysite');
```

---

## Migration Guide

### From Old System to New System

The new system is **backward compatible** with feature flags:

1. **Set feature flags in `.env`:**
   ```env
   USE_DATABASE=false  # Use in-memory storage (old system)
   MULTI_PROVIDER=false  # Use Ollama only (old system)
   ```

2. **Gradually enable features:**
   ```env
   USE_DATABASE=true  # Switch to PostgreSQL
   MULTI_PROVIDER=false  # Still use Ollama only
   ```

3. **Enable all new features:**
   ```env
   USE_DATABASE=true
   MULTI_PROVIDER=true
   CONVERSATION_MEMORY=true
   CONTENT_FILTERING=true
   ```

### Data Migration

If you have existing analytics data:

1. Old analytics are stored in `analytics.json`
2. New analytics go to `analytics_events` table
3. No automatic migration needed - both can coexist
4. Old data will be preserved in JSON file

---

## Architecture

### New File Structure

```
omni-chat/
├── server/
│   ├── ai/
│   │   ├── providers/
│   │   │   ├── ollama-provider.js
│   │   │   ├── openai-provider.js
│   │   │   ├── anthropic-provider.js
│   │   │   └── openrouter-provider.js
│   │   ├── types.js
│   │   ├── factory.js
│   │   ├── conversation-manager.js
│   │   └── index.js
│   ├── db/
│   │   ├── schema/
│   │   │   ├── sessions.js
│   │   │   ├── messages.js
│   │   │   ├── sites.js
│   │   │   ├── analytics.js
│   │   │   └── index.js
│   │   ├── config.js
│   │   ├── index.js
│   │   ├── migrate.js
│   │   └── seed.js
│   ├── repositories/
│   │   ├── session-repository.js
│   │   ├── message-repository.js
│   │   ├── analytics-repository.js
│   │   ├── site-repository.js
│   │   └── index.js
│   ├── filters/
│   │   └── content-filter.js
│   ├── ollama.js (legacy - still works)
│   ├── store.js (will be updated to use DB)
│   └── socket-handler.js (will be updated)
├── contexts/
│   ├── default.md
│   └── appahouse.md
├── drizzle/
│   └── 0000_broken_reptil.sql
├── drizzle.config.js
├── package.json (updated with new scripts)
└── .env.example (updated with new vars)
```

### Design Patterns

1. **Repository Pattern** - Clean data access layer
2. **Factory Pattern** - Provider instantiation
3. **Strategy Pattern** - Switchable AI providers
4. **Singleton Pattern** - Database connections, provider instances
5. **Observer Pattern** - Streaming callbacks

---

## API Reference

### Repositories

#### SessionRepository
- `createSession(siteId, visitorInfo)` - Create new session
- `getSession(sessionId)` - Get session with messages
- `updateStatus(sessionId, status)` - Update session status
- `flagSession(sessionId, reason)` - Flag for review
- `submitFeedback(sessionId, rating, comment)` - Submit feedback
- `closeSession(sessionId)` - Close session
- `getConversationContext(sessionId, limit)` - Get messages for AI

#### MessageRepository
- `createMessage(sessionId, role, content, metadata)` - Create message
- `getMessagesBySession(sessionId, limit)` - Get all messages
- `markAsSeen(messageId)` - Mark message as seen
- `getMessagesForAI(sessionId, limit)` - Get formatted for AI context

#### SiteRepository
- `getSite(siteId)` - Get site configuration
- `getSiteOrDefault(siteId)` - Get site or fallback to default
- `createSite(siteData)` - Create new site
- `updateSite(siteId, updates)` - Update site config
- `updateAIProvider(siteId, provider, model)` - Update AI settings

#### AnalyticsRepository
- `logEvent(eventType, data)` - Log analytics event
- `getEventsByType(eventType, limit)` - Get events by type
- `getAIMetrics(startDate, endDate)` - Get AI performance metrics

### AI Providers

All providers implement:
- `generate(request)` - Non-streaming generation
- `streamGenerate(request, callbacks)` - Streaming generation
- `checkAvailability()` - Health check
- `isConfigured()` - Configuration check

### ConversationManager

- `generateResponse(sessionId, siteConfig)` - Generate AI response
- `buildContext(sessionId, siteConfig)` - Build conversation context
- `generateConversationSummary(sessionId)` - Create summary
- `generateQuickReplies(sessionId, siteConfig)` - Get quick reply suggestions
- `loadContextFile(contextFile)` - Load site-specific context

---

## Performance Considerations

### Database

- **Connection pooling**: 20 max connections (configurable)
- **Indexes**: Optimized for common queries
- **Query batching**: Available for bulk operations

### Caching

- **Context files**: 5-minute TTL
- **Provider instances**: Singleton per type
- **Database connections**: Connection pooling

### AI Requests

- **Retry logic**: Exponential backoff (500ms, 1s, 2s)
- **Timeouts**: 30s for streaming, 15s for quick replies
- **Rate limiting**: Handled per provider with retry-after headers

---

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running on port 5438
psql -h localhost -p 5438 -U user -d omni_chat

# Check connection from Node.js
npm run db:studio
```

### AI Provider Not Working

```javascript
import { checkAllProviders } from './server/ai/factory.js';
const status = await checkAllProviders();
console.log(status);
```

Common issues:
- **Ollama**: Check `OLLAMA_URL`, ensure Ollama is running, model is pulled
- **OpenAI**: Check API key is valid, has credits
- **Anthropic**: Check API key format (`sk-ant-...`)
- **OpenRouter**: Check API key, site URL/name configured

### Migration Failures

```bash
# Drop all tables and re-run
# WARNING: This deletes all data!
npm run db:push

# Or manually check migration status
psql -h localhost -p 5438 -U user -d omni_chat
SELECT * FROM drizzle_migrations;
```

---

## Next Steps

### Recommended Enhancements

1. **Admin Dashboard UI** - Visual configuration interface
2. **Real-time Metrics** - Live AI performance dashboard
3. **A/B Testing** - Compare provider performance
4. **Advanced Filtering** - AI-powered content moderation
5. **Multi-language Support** - Automatic translation
6. **Voice/Audio** - Speech-to-text integration

### Contributing

When adding new features:
1. Follow existing patterns (repositories, providers)
2. Add appropriate database migrations
3. Update this README
4. Add tests (recommended)

---

## License

Same as omni-chat main license.

## Support

For issues or questions:
1. Check this README
2. Review code comments
3. Check database schema documentation
4. Open an issue

---

**Built with:**
- Drizzle ORM
- PostgreSQL
- Node.js
- Socket.io
- Multiple AI Providers (Ollama, OpenAI, Anthropic, OpenRouter)
