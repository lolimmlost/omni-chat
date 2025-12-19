const store = require('./store');
const { verifyToken } = require('./auth');
const { streamResponse, generateQuickReplies } = require('./ollama');
const { notifyNewSession, notifyWaitingHuman, notifyMessage } = require('./webhooks');
const cannedResponses = require('./canned-responses');
const analytics = require('./analytics');
const {
  sanitizeText,
  sanitizeSiteId,
  checkRateLimit,
  trackConnection,
  removeConnection
} = require('./sanitize');

// Track socket -> session mappings
const visitorSockets = new Map(); // socketId -> sessionId
const adminSockets = new Set(); // authenticated admin socket IDs

// Track typing status
const typingTimers = new Map(); // sessionId -> { visitor: timeout, admin: timeout }

// Track admin online status
let adminOnlineStatus = 'offline'; // online | away | offline

function getClientIp(socket) {
  return socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || socket.handshake.address
    || 'unknown';
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    const clientIp = getClientIp(socket);

    // Check connection limit per IP
    if (!trackConnection(clientIp, socket.id)) {
      console.log(`Connection rejected (rate limit): ${clientIp}`);
      socket.emit('error', { message: 'Too many connections' });
      socket.disconnect(true);
      return;
    }

    console.log(`Socket connected: ${socket.id} from ${clientIp}`);

    // ─────────────────────────────────────────
    // VISITOR EVENTS
    // ─────────────────────────────────────────

    socket.on('visitor:join', (data) => {
      const siteId = sanitizeSiteId(data?.siteId);
      const visitorInfo = {
        pageUrl: typeof data?.pageUrl === 'string' ? data.pageUrl.slice(0, 500) : '',
        pageTitle: typeof data?.pageTitle === 'string' ? data.pageTitle.slice(0, 200) : '',
        referrer: typeof data?.referrer === 'string' ? data.referrer.slice(0, 500) : '',
        userAgent: typeof data?.userAgent === 'string' ? data.userAgent.slice(0, 500) : '',
        ip: clientIp
      };
      const session = store.createSession(siteId, visitorInfo);
      visitorSockets.set(socket.id, session.id);
      socket.join(`session:${session.id}`);
      socket.emit('visitor:joined', { sessionId: session.id });

      // Track analytics
      analytics.trackSession();

      // Notify admins of new session
      io.to('admins').emit('admin:session-created', {
        id: session.id,
        siteId: session.siteId,
        status: session.status,
        createdAt: session.createdAt,
        visitorInfo: session.visitorInfo
      });

      // Send webhook notification
      notifyNewSession(session);

      console.log(`Visitor joined: session ${session.id} from site ${siteId}`);
    });

    socket.on('visitor:message', (data) => {
      const sessionId = visitorSockets.get(socket.id);
      if (!sessionId) return;

      // Rate limit check
      if (!checkRateLimit(sessionId)) {
        socket.emit('error', { message: 'Slow down! Too many messages.' });
        return;
      }

      // Sanitize input
      const content = sanitizeText(data?.content);
      if (!content) return; // Empty after sanitization

      const message = store.addMessage(sessionId, {
        role: 'visitor',
        content
      });

      if (message) {
        // Track analytics
        analytics.trackMessage();

        // Broadcast to session room (includes admin if joined)
        io.to(`session:${sessionId}`).emit('message', message);

        // Notify all admins of activity
        io.to('admins').emit('admin:session-activity', {
          sessionId,
          message
        });
      }
    });

    socket.on('visitor:request-human', () => {
      const sessionId = visitorSockets.get(socket.id);
      if (!sessionId) return;

      const session = store.getSession(sessionId);
      store.setStatus(sessionId, 'waiting_human');
      io.to('admins').emit('admin:session-status', {
        sessionId,
        status: 'waiting_human'
      });
      socket.emit('status', { status: 'waiting_human' });

      // Webhook notification
      if (session) notifyWaitingHuman(session);

      console.log(`Session ${sessionId} waiting for human`);
    });

    socket.on('visitor:request-ai', () => {
      const sessionId = visitorSockets.get(socket.id);
      if (!sessionId) return;

      // Rate limit AI requests too
      if (!checkRateLimit(sessionId)) {
        socket.emit('error', { message: 'Slow down! Too many requests.' });
        return;
      }

      const session = store.getSession(sessionId);
      if (!session) return;

      store.setStatus(sessionId, 'waiting_ai');
      socket.emit('status', { status: 'waiting_ai' });

      // Stream AI response
      streamResponse(
        session.messages,
        session.siteId,
        (chunk) => {
          io.to(`session:${sessionId}`).emit('ai:chunk', { chunk });
        },
        (fullResponse) => {
          const aiMessage = store.addMessage(sessionId, {
            role: 'ai',
            content: fullResponse
          });
          store.setStatus(sessionId, 'active');
          io.to(`session:${sessionId}`).emit('ai:complete', { message: aiMessage });
          io.to('admins').emit('admin:session-activity', {
            sessionId,
            message: aiMessage
          });
        },
        (error) => {
          console.error('Ollama error:', error);
          socket.emit('ai:error', { error: 'AI service unavailable' });
          store.setStatus(sessionId, 'active');
        }
      );
    });

    socket.on('visitor:feedback', (data) => {
      const sessionId = visitorSockets.get(socket.id);
      if (!sessionId) return;

      const rating = parseInt(data?.rating);
      if (rating < 1 || rating > 5 || isNaN(rating)) return;

      const comment = typeof data?.comment === 'string' ? data.comment.slice(0, 500) : '';

      store.setFeedback(sessionId, { rating, comment });

      // Notify admins of new feedback
      io.to('admins').emit('admin:session-feedback', {
        sessionId,
        rating,
        comment
      });

      console.log(`Feedback received for session ${sessionId}: ${rating} stars`);
    });

    socket.on('visitor:mark-seen', () => {
      const sessionId = visitorSockets.get(socket.id);
      if (!sessionId) return;

      const updated = store.markMessagesSeen(sessionId, 'visitor');
      if (updated.length > 0) {
        io.to('admins').emit('admin:messages-seen', { sessionId, messageIds: updated });
      }
    });

    socket.on('visitor:typing', () => {
      const sessionId = visitorSockets.get(socket.id);
      if (!sessionId) return;

      // Clear existing timer
      const timers = typingTimers.get(sessionId) || {};
      if (timers.visitor) clearTimeout(timers.visitor);

      // Broadcast typing status
      io.to(`session:${sessionId}`).emit('typing', { role: 'visitor', isTyping: true });
      io.to('admins').emit('admin:typing', { sessionId, role: 'visitor', isTyping: true });

      // Auto-clear after 3s
      timers.visitor = setTimeout(() => {
        io.to(`session:${sessionId}`).emit('typing', { role: 'visitor', isTyping: false });
        io.to('admins').emit('admin:typing', { sessionId, role: 'visitor', isTyping: false });
      }, 3000);
      typingTimers.set(sessionId, timers);
    });

    // ─────────────────────────────────────────
    // ADMIN EVENTS
    // ─────────────────────────────────────────

    socket.on('admin:auth', (data, callback) => {
      if (typeof callback !== 'function') return;

      const token = typeof data?.token === 'string' ? data.token : '';
      if (verifyToken(token)) {
        adminSockets.add(socket.id);
        socket.join('admins');
        // Update admin status to online
        if (adminOnlineStatus === 'offline') {
          adminOnlineStatus = 'online';
          io.emit('admin:status', { status: adminOnlineStatus });
        }
        callback({ success: true, adminStatus: adminOnlineStatus });
        console.log(`Admin authenticated: ${socket.id}`);
      } else {
        callback({ success: false, error: 'Invalid token' });
      }
    });

    socket.on('admin:set-status', (data) => {
      if (!adminSockets.has(socket.id)) return;
      const status = ['online', 'away', 'offline'].includes(data?.status) ? data.status : 'online';
      adminOnlineStatus = status;
      io.emit('admin:status', { status: adminOnlineStatus });
    });

    socket.on('admin:get-status', (callback) => {
      if (typeof callback === 'function') {
        callback({ status: adminOnlineStatus });
      }
    });

    socket.on('admin:list-sessions', (callback) => {
      if (typeof callback !== 'function') return;
      if (!adminSockets.has(socket.id)) {
        return callback({ error: 'Unauthorized' });
      }
      callback({ sessions: store.listSessions() });
    });

    socket.on('admin:join-session', (data) => {
      if (!adminSockets.has(socket.id)) return;

      const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : '';
      const session = store.getSession(sessionId);
      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }

      socket.join(`session:${sessionId}`);
      store.setAdminSocket(sessionId, socket.id);
      socket.emit('admin:session-joined', {
        session: {
          ...session,
          messages: session.messages
        }
      });
      console.log(`Admin joined session: ${sessionId}`);
    });

    socket.on('admin:leave-session', (data) => {
      if (!adminSockets.has(socket.id)) return;
      const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : '';
      if (sessionId) {
        socket.leave(`session:${sessionId}`);
        store.setAdminSocket(sessionId, null);
      }
    });

    socket.on('admin:message', (data) => {
      if (!adminSockets.has(socket.id)) return;

      const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : '';
      const content = sanitizeText(data?.content);
      if (!sessionId || !content) return;

      const message = store.addMessage(sessionId, {
        role: 'admin',
        content
      });

      if (message) {
        store.setStatus(sessionId, 'active');
        io.to(`session:${sessionId}`).emit('message', message);
        io.to('admins').emit('admin:session-status', {
          sessionId,
          status: 'active'
        });
      }
    });

    socket.on('admin:typing', (data) => {
      if (!adminSockets.has(socket.id)) return;

      const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : '';
      if (!sessionId) return;

      // Clear existing timer
      const timers = typingTimers.get(sessionId) || {};
      if (timers.admin) clearTimeout(timers.admin);

      // Broadcast typing status to session
      io.to(`session:${sessionId}`).emit('typing', { role: 'admin', isTyping: true });

      // Auto-clear after 3s
      timers.admin = setTimeout(() => {
        io.to(`session:${sessionId}`).emit('typing', { role: 'admin', isTyping: false });
      }, 3000);
      typingTimers.set(sessionId, timers);
    });

    socket.on('admin:mark-seen', (data) => {
      if (!adminSockets.has(socket.id)) return;

      const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : '';
      if (!sessionId) return;

      const updated = store.markMessagesSeen(sessionId, 'admin');
      if (updated.length > 0) {
        io.to(`session:${sessionId}`).emit('messages:seen', { messageIds: updated });
      }
    });

    socket.on('admin:get-quick-replies', async (data, callback) => {
      if (!adminSockets.has(socket.id)) {
        if (typeof callback === 'function') callback({ replies: [] });
        return;
      }

      const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : '';
      if (!sessionId) {
        if (typeof callback === 'function') callback({ replies: [] });
        return;
      }

      const session = store.getSession(sessionId);
      if (!session) {
        if (typeof callback === 'function') callback({ replies: [] });
        return;
      }

      try {
        const replies = await generateQuickReplies(session.messages, session.siteId);
        if (typeof callback === 'function') callback({ replies });
      } catch (err) {
        console.error('Quick replies error:', err);
        if (typeof callback === 'function') callback({ replies: [] });
      }
    });

    // Canned responses
    socket.on('admin:get-canned-responses', (callback) => {
      if (!adminSockets.has(socket.id)) {
        if (typeof callback === 'function') callback({ responses: [] });
        return;
      }
      if (typeof callback === 'function') {
        callback({ responses: cannedResponses.getResponses() });
      }
    });

    socket.on('admin:add-canned-response', (data, callback) => {
      if (!adminSockets.has(socket.id)) {
        if (typeof callback === 'function') callback({ error: 'Unauthorized' });
        return;
      }

      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      const category = typeof data?.category === 'string' ? data.category.trim() : 'general';

      if (!text) {
        if (typeof callback === 'function') callback({ error: 'Text required' });
        return;
      }

      const response = cannedResponses.addResponse(text, category);
      io.to('admins').emit('admin:canned-response-added', response);
      if (typeof callback === 'function') callback({ response });
    });

    socket.on('admin:delete-canned-response', (data, callback) => {
      if (!adminSockets.has(socket.id)) {
        if (typeof callback === 'function') callback({ error: 'Unauthorized' });
        return;
      }

      const id = typeof data?.id === 'string' ? data.id : '';
      if (!id) {
        if (typeof callback === 'function') callback({ error: 'Invalid ID' });
        return;
      }

      const deleted = cannedResponses.deleteResponse(id);
      if (deleted) {
        io.to('admins').emit('admin:canned-response-deleted', { id });
      }
      if (typeof callback === 'function') callback({ success: deleted });
    });

    socket.on('admin:get-analytics', (callback) => {
      if (!adminSockets.has(socket.id)) {
        if (typeof callback === 'function') callback({ error: 'Unauthorized' });
        return;
      }

      if (typeof callback === 'function') {
        callback({ data: analytics.getAnalyticsSummary() });
      }
    });

    socket.on('admin:update-session-meta', (data, callback) => {
      if (!adminSockets.has(socket.id)) {
        if (typeof callback === 'function') callback({ error: 'Unauthorized' });
        return;
      }

      const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : '';
      if (!sessionId) {
        if (typeof callback === 'function') callback({ error: 'Invalid session' });
        return;
      }

      const session = store.setSessionMeta(sessionId, {
        notes: data.notes,
        tags: data.tags
      });

      if (session) {
        io.to('admins').emit('admin:session-meta-updated', {
          sessionId,
          notes: session.notes,
          tags: session.tags
        });
        if (typeof callback === 'function') callback({ success: true });
      } else {
        if (typeof callback === 'function') callback({ error: 'Session not found' });
      }
    });

    socket.on('admin:close-session', (data) => {
      if (!adminSockets.has(socket.id)) return;

      const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : '';
      if (!sessionId) return;

      store.closeSession(sessionId);
      io.to(`session:${sessionId}`).emit('session:closed');
      io.to('admins').emit('admin:session-status', {
        sessionId,
        status: 'closed'
      });
      console.log(`Session closed: ${sessionId}`);
    });

    // ─────────────────────────────────────────
    // DISCONNECT
    // ─────────────────────────────────────────

    socket.on('disconnect', () => {
      // Clean up connection tracking
      removeConnection(clientIp, socket.id);

      const sessionId = visitorSockets.get(socket.id);
      if (sessionId) {
        visitorSockets.delete(socket.id);
        io.to('admins').emit('admin:visitor-disconnected', { sessionId });
      }

      if (adminSockets.has(socket.id)) {
        adminSockets.delete(socket.id);
      }

      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}

module.exports = { setupSocketHandlers };
