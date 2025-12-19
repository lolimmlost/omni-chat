require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { setupSocketHandlers } = require('./socket-handler');

const { checkModelAvailability } = require('./ollama');

const PORT = process.env.PORT || 3100;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:8000', 'http://localhost:3000'];

const app = express();
const server = http.createServer(app);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc)
      if (!origin) return callback(null, true);

      // Check against allowed origins
      if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
        return callback(null, true);
      }

      // In production, also allow the main domain
      if (origin.endsWith('.appahouse.com') || origin === 'https://appahouse.com') {
        return callback(null, true);
      }

      callback(new Error('CORS not allowed'));
    },
    methods: ['GET', 'POST']
  }
});

// Serve static files
app.use('/admin/analytics', express.static(path.join(__dirname, '..', 'admin', 'analytics')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin', 'dashboard')));
app.use('/widget', express.static(path.join(__dirname, '..', 'widget')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Setup WebSocket handlers
setupSocketHandlers(io);

// Start server
server.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                    OMNI-CHAT                          ║
╠═══════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                         ║
║                                                       ║
║  Dashboard:  http://localhost:${PORT}/admin             ║
║  Widget:     http://localhost:${PORT}/widget/chat-widget.js
║                                                       ║
║  CLI Admin:  npm run cli                              ║
╚═══════════════════════════════════════════════════════╝
  `);

  // Check Ollama availability
  const ollamaStatus = await checkModelAvailability();
  if (ollamaStatus.available) {
    console.log(`  ✓ Ollama connected (model ready)`);
  } else {
    console.log(`  ⚠ Ollama: ${ollamaStatus.error}`);
    console.log(`    AI features will be unavailable until Ollama is running`);
  }
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Close all socket connections
  io.close(() => {
    console.log('Socket.io connections closed');
  });

  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.log('Forcing exit...');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
