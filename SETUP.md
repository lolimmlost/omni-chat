# Omni-Chat Setup Guide

## Quick Start

Follow these steps to get the enhanced Omni-Chat system up and running with PostgreSQL and multi-provider AI support.

## Prerequisites

- ✅ Node.js 18+ installed
- ✅ PostgreSQL server running on port **5438**
- ✅ At least one AI provider (Ollama recommended for local testing)

## Step 1: Database Setup

### Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -h localhost -p 5438 -U postgres

# Create database
CREATE DATABASE omni_chat;

# Create user (if needed)
CREATE USER omni_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE omni_chat TO omni_user;

# Exit psql
\q
```

## Step 2: Configure Environment

### Create `.env` file

```bash
cp .env.example .env
```

### Edit `.env` with your settings

**Minimum required configuration:**

```env
# Admin token (change this!)
ADMIN_TOKEN=your-secure-random-token-here

# Database (update with your credentials)
DATABASE_URL=postgresql://omni_user:your_password@localhost:5438/omni_chat

# Ollama (if using local AI)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Feature flags
USE_DATABASE=true
MULTI_PROVIDER=true
CONVERSATION_MEMORY=true
CONTENT_FILTERING=false
```

**Optional AI providers:**

```env
# OpenAI (if using)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Anthropic (if using)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250514

# OpenRouter (if using)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-3-5-sonnet
```

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Run Migrations

```bash
# Generate migration files (already done, but can re-run)
npm run db:generate

# Run migrations to create tables
npm run db:migrate

# Seed default data (default site, appahouse site, canned responses)
npm run db:seed
```

Expected output:
```
✅ Migrations completed successfully!
✅ Created default site configuration
✅ Created appahouse site configuration
✅ Created 5 canned responses
🎉 Seeding completed successfully!
```

## Step 5: Test Configuration

```bash
npm run test:db
```

Expected output:
```
🔍 Testing Omni-Chat Configuration...

📊 Database Connection:
   URL: postgresql://omni_user:***@localhost:5438/omni_chat
   ✅ Database connection successful!

🤖 AI Provider Status:
   ✅ OLLAMA: Ollama available with model llama3.2
   ❌ OPENAI: Not configured
   ❌ ANTHROPIC: Not configured
   ❌ OPENROUTER: Not configured

📝 Configuration Summary:
   USE_DATABASE: true
   MULTI_PROVIDER: true
   CONVERSATION_MEMORY: true
   CONTENT_FILTERING: false

✨ Test complete!
```

## Step 6: Setup AI Provider

### Option A: Ollama (Local, Free)

**Install Ollama:**
```bash
# macOS/Linux
curl https://ollama.ai/install.sh | sh

# Or download from https://ollama.ai
```

**Pull model:**
```bash
ollama pull llama3.2
```

**Verify:**
```bash
curl http://localhost:11434/api/tags
```

### Option B: OpenAI

1. Get API key from https://platform.openai.com/api-keys
2. Add to `.env`:
   ```env
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   ```

### Option C: Anthropic (Claude)

1. Get API key from https://console.anthropic.com/
2. Add to `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-4-5-20250514
   ```

### Option D: OpenRouter

1. Get API key from https://openrouter.ai/keys
2. Add to `.env`:
   ```env
   OPENROUTER_API_KEY=sk-or-...
   OPENROUTER_MODEL=anthropic/claude-3-5-sonnet
   OPENROUTER_SITE_URL=https://yoursite.com
   ```

## Step 7: Create Context Files

Create custom AI contexts for your sites:

```bash
# Create contexts directory if it doesn't exist
mkdir -p contexts

# Create a context file for your site
cat > contexts/mysite.md << 'EOF'
# My Site Support Assistant

You are a helpful customer support assistant for My Website.

## Your Role
- Answer questions about our products and services
- Help troubleshoot common issues
- Provide friendly, professional support

## Key Information
- Business hours: 9 AM - 5 PM EST
- Response time: Usually within 1 hour
- Escalation: Complex issues go to human agents

## Tone
Be friendly, professional, and concise. Use plain language.
EOF
```

## Step 8: Configure Sites in Database

Use the Drizzle Studio to manage sites:

```bash
npm run db:studio
```

Or create sites programmatically (see AI_INTEGRATION_README.md for examples).

## Step 9: Start Server

```bash
npm start
```

Expected output:
```
Server running on http://localhost:3100
Socket.io server started
Checking Ollama availability...
✓ Ollama is available with model: llama3.2
```

## Step 10: Test with Widget

Add the chat widget to your website:

```html
<script src="http://localhost:3100/chat-widget.js"
        data-site-id="mysite"
        data-admin-token="your-admin-token"></script>
```

## Verification Checklist

- [ ] PostgreSQL database created and accessible
- [ ] `.env` file configured
- [ ] Dependencies installed (`npm install`)
- [ ] Migrations run successfully (`npm run db:migrate`)
- [ ] Default data seeded (`npm run db:seed`)
- [ ] Test script passes (`npm run test:db`)
- [ ] At least one AI provider configured and working
- [ ] Context files created (optional but recommended)
- [ ] Server starts without errors
- [ ] Widget loads on test page

## Common Issues

### Database Connection Failed

**Problem:** Can't connect to PostgreSQL

**Solutions:**
1. Check PostgreSQL is running: `pg_isready -h localhost -p 5438`
2. Verify port 5438 is correct (or update in `.env`)
3. Check credentials in `DATABASE_URL`
4. Ensure database `omni_chat` exists

### Ollama Not Available

**Problem:** Ollama provider shows as unavailable

**Solutions:**
1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. Pull the model: `ollama pull llama3.2`
3. Verify `OLLAMA_URL` and `OLLAMA_MODEL` in `.env`

### Migration Failed

**Problem:** `npm run db:migrate` fails

**Solutions:**
1. Check database exists and is accessible
2. Ensure no existing tables conflict
3. Try `npm run db:push` (force sync, WARNING: destructive)
4. Check migration files in `drizzle/` directory

### Feature Not Working

**Problem:** Conversation memory or other features don't work

**Solutions:**
1. Check feature flags in `.env`:
   ```env
   CONVERSATION_MEMORY=true
   CONTENT_FILTERING=true
   ```
2. Verify site configuration in database has features enabled
3. Restart server after changing `.env`

## Next Steps

1. **Configure sites** - Add your actual sites to database
2. **Customize contexts** - Create site-specific AI personalities
3. **Set up webhooks** - Get notifications in Slack/Discord
4. **Review analytics** - Use Drizzle Studio to view data
5. **Customize branding** - Update site colors and names
6. **Add monitoring** - Set up logging and alerts

## Support

For detailed documentation, see:
- `AI_INTEGRATION_README.md` - Complete feature documentation
- `README.md` - Original omni-chat documentation
- Comments in code files

## Development Tools

**Drizzle Studio** (Database GUI):
```bash
npm run db:studio
# Opens at https://local.drizzle.studio
```

**Database CLI**:
```bash
psql -h localhost -p 5438 -U omni_user -d omni_chat
```

**Test AI Providers**:
```bash
npm run test:db
```

**Admin CLI**:
```bash
npm run cli
```

---

🎉 **You're all set!** Your enhanced Omni-Chat system is ready to use with PostgreSQL and multi-provider AI support.
