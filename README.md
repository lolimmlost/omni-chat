# Omni-Chat

> A real-time live chat system with AI-powered responses, built for modern websites.

```
╔═══════════════════════════════════════════════════════╗
║                    OMNI-CHAT                          ║
╠═══════════════════════════════════════════════════════╣
║  Dashboard:  /admin                                   ║
║  Widget:     /widget/chat-widget.js                   ║
║  Analytics:  /admin/analytics                         ║
║  CLI:        npm run cli                              ║
╚═══════════════════════════════════════════════════════╝
```

## Features

### Core
- **Real-time WebSocket chat** - Socket.io powered, instant messaging
- **Multi-site support** - One server, multiple websites
- **Three response modes** - Human admin, AI (Ollama), or hybrid
- **Admin dashboard** - Beautiful dark-themed interface
- **CLI admin** - Terminal-based session management

### Widget (20+ features)
| Feature | Description |
|---------|-------------|
| Typing indicators | See when the other party is typing |
| Pre-chat form | Collect visitor name/email before chat |
| Sound notifications | Audio alerts with mute toggle |
| Transcript download | Export chat as `.txt` file |
| Emoji picker | Quick emoji insertion |
| Dark/Light theme | Auto-detects system preference |
| Offline queue | Messages queue when disconnected |
| Feedback ratings | 1-5 star rating after chat |
| Read receipts | Double-check marks for seen messages |

### Dashboard
| Feature | Description |
|---------|-------------|
| Session search & filter | Find sessions by status, site, content |
| Session notes & tags | Add context to conversations |
| Canned responses | Save and reuse common replies |
| AI quick replies | Get AI-suggested responses |
| Desktop notifications | Never miss a waiting visitor |
| Export JSON/CSV | Download session data |
| Analytics dashboard | Charts and metrics |

### AI & Integration
| Feature | Description |
|---------|-------------|
| Ollama streaming | Real-time AI responses |
| Per-site contexts | Different AI personality per site |
| Webhook notifications | Slack/Discord integration |
| Retry with backoff | Robust connection handling |

## Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/omni-chat.git
cd omni-chat
npm install

# Configure
cp .env.example .env
# Edit .env with your settings

# Run
npm start
```

## Configuration

```env
# .env
PORT=3100
ADMIN_TOKEN=your-secret-token
ALLOWED_ORIGINS=https://yoursite.com,https://another.com
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Optional webhooks
WEBHOOK_URL=https://hooks.slack.com/services/...
WEBHOOK_EVENTS=waiting_human,new_session
```

## Embed the Widget

Add to any website:

```html
<script
  src="https://your-server.com/widget/chat-widget.js"
  data-server="https://your-server.com"
  data-site="my-site-id"
  data-theme="auto"
  data-prechat="true"
  data-position="right">
</script>
```

### Widget Options

| Attribute | Values | Description |
|-----------|--------|-------------|
| `data-server` | URL | Your Omni-Chat server |
| `data-site` | string | Unique site identifier |
| `data-theme` | `auto`, `dark`, `light` | Color theme |
| `data-position` | `left`, `right` | Widget position |
| `data-prechat` | `true`, `false` | Show pre-chat form |
| `data-prechat-fields` | `name`, `name,email` | Form fields |

## Per-Site AI Context

Create `contexts/{site-id}.md` for custom AI personalities:

```markdown
<!-- contexts/my-store.md -->
You are a helpful shopping assistant for MyStore.
- We sell electronics and gadgets
- Free shipping over $50
- 30-day return policy
```

## Architecture

```
omni-chat/
├── server/
│   ├── index.js          # Express + Socket.io server
│   ├── socket-handler.js # WebSocket event handlers
│   ├── ollama.js         # AI integration with retry logic
│   ├── store.js          # In-memory session storage
│   ├── webhooks.js       # Slack/Discord notifications
│   └── analytics.js      # Usage tracking
├── admin/
│   ├── dashboard/        # Web admin interface
│   ├── analytics/        # Charts and metrics
│   └── cli.js            # Terminal admin
├── widget/
│   └── chat-widget.js    # Embeddable chat widget
└── contexts/             # Per-site AI context files
```

## API Events

### Visitor Events
```js
socket.emit('visitor:join', { siteId, pageUrl, ... })
socket.emit('visitor:message', { content })
socket.emit('visitor:request-human')
socket.emit('visitor:request-ai')
socket.emit('visitor:typing')
socket.emit('visitor:feedback', { rating, comment })
```

### Admin Events
```js
socket.emit('admin:auth', { token }, callback)
socket.emit('admin:message', { sessionId, content })
socket.emit('admin:close-session', { sessionId })
socket.emit('admin:get-quick-replies', { sessionId }, callback)
```

## Screenshots

### Widget
```
┌──────────────────────────┐
│ 💬 Chat with us      ─ × │
├──────────────────────────┤
│                          │
│  ○ Hi! How can I help?   │
│                          │
│        Need pricing ●    │
│                          │
│  ○ Sure! Our plans...    │
│                          │
├──────────────────────────┤
│ [Type a message...]  [→] │
└──────────────────────────┘
```

### Dashboard
```
┌─────────────┬────────────────────────────────────┐
│ Sessions    │  Chat: visitor-abc123              │
│─────────────│────────────────────────────────────│
│ ● waiting   │  [Visitor] Need help with order    │
│ ○ site-a    │  [You] Sure, what's the issue?     │
│ ○ site-b    │  [Visitor] Can't checkout...       │
│             │                                    │
│ [Export]    │  [AI Suggestions]                  │
│ [Clear]     │  ┌─────────────────────────────┐   │
│             │  │ "Let me check that for you" │   │
└─────────────┴──┴─────────────────────────────┴───┘
```

## License

MIT

---

Built with Socket.io, Express, and Ollama.
