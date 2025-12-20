const crypto = require('crypto');

const sessions = new Map();

// Config
const MAX_SESSIONS = 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLOSED_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function createSession(siteId, visitorInfo = {}) {
  // Enforce max sessions
  if (sessions.size >= MAX_SESSIONS) {
    // Remove oldest closed session, or oldest session
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [id, s] of sessions.entries()) {
      if (s.status === 'closed' || s.createdAt < oldestTime) {
        oldestTime = s.createdAt;
        oldestKey = id;
        if (s.status === 'closed') break; // Prefer removing closed
      }
    }
    if (oldestKey) sessions.delete(oldestKey);
  }

  const session = {
    id: generateId(),
    siteId,
    messages: [],
    status: 'active', // active | waiting_human | waiting_ai | closed
    createdAt: Date.now(),
    adminSocketId: null,
    visitorInfo: {
      pageUrl: visitorInfo.pageUrl || '',
      pageTitle: visitorInfo.pageTitle || '',
      referrer: visitorInfo.referrer || '',
      userAgent: visitorInfo.userAgent || '',
      ip: visitorInfo.ip || '',
      screen: visitorInfo.screen || null,
      viewport: visitorInfo.viewport || null,
      language: visitorInfo.language || '',
      device: visitorInfo.device || null,
      pageJourney: visitorInfo.pageUrl ? [{
        url: visitorInfo.pageUrl,
        title: visitorInfo.pageTitle || '',
        timestamp: Date.now()
      }] : []
    }
  };
  sessions.set(session.id, session);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function addMessage(sessionId, message) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const msg = {
    id: generateId(),
    ...message,
    timestamp: Date.now(),
    delivered: true,
    seen: false
  };
  session.messages.push(msg);
  return msg;
}

function markMessagesSeen(sessionId, reader) {
  const session = sessions.get(sessionId);
  if (!session) return [];

  const updated = [];
  for (const msg of session.messages) {
    // Admin marks visitor messages as seen, visitor marks admin/ai messages as seen
    if (!msg.seen && msg.role !== reader) {
      msg.seen = true;
      msg.seenAt = Date.now();
      updated.push(msg.id);
    }
  }
  return updated;
}

function setStatus(sessionId, status) {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = status;
    if (status === 'closed') {
      session.closedAt = Date.now();
    }
  }
  return session;
}

function setAdminSocket(sessionId, socketId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.adminSocketId = socketId;
  }
  return session;
}

function listSessions(includesClosed = false) {
  const list = [];
  for (const session of sessions.values()) {
    if (!includesClosed && session.status === 'closed') continue;
    list.push({
      id: session.id,
      siteId: session.siteId,
      status: session.status,
      messageCount: session.messages.length,
      lastMessage: session.messages[session.messages.length - 1] || null,
      createdAt: session.createdAt,
      feedback: session.feedback || null,
      visitorInfo: session.visitorInfo || null,
      notes: session.notes || '',
      tags: session.tags || []
    });
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

function closeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = 'closed';
    session.closedAt = Date.now();
  }
  return session;
}

function setFeedback(sessionId, feedback) {
  const session = sessions.get(sessionId);
  if (session) {
    session.feedback = {
      rating: feedback.rating,
      comment: feedback.comment || '',
      submittedAt: Date.now()
    };
  }
  return session;
}

function setSessionMeta(sessionId, meta) {
  const session = sessions.get(sessionId);
  if (session) {
    if (typeof meta.notes === 'string') {
      session.notes = meta.notes.slice(0, 1000);
    }
    if (Array.isArray(meta.tags)) {
      session.tags = meta.tags.slice(0, 10).map(t => String(t).slice(0, 20));
    }
  }
  return session;
}

function deleteSession(sessionId) {
  return sessions.delete(sessionId);
}

function addPageVisit(sessionId, pageData) {
  const session = sessions.get(sessionId);
  if (!session || !session.visitorInfo) return null;

  const journey = session.visitorInfo.pageJourney || [];
  const lastPage = journey[journey.length - 1];

  // Deduplicate consecutive visits to same URL
  if (lastPage && lastPage.url === pageData.url) return null;

  const visit = {
    url: typeof pageData.url === 'string' ? pageData.url.slice(0, 500) : '',
    title: typeof pageData.title === 'string' ? pageData.title.slice(0, 200) : '',
    timestamp: Date.now()
  };

  journey.push(visit);

  // Keep max 50 pages to prevent memory bloat
  if (journey.length > 50) {
    journey.shift();
  }

  session.visitorInfo.pageJourney = journey;
  session.visitorInfo.pageUrl = visit.url;
  session.visitorInfo.pageTitle = visit.title;

  return visit;
}

// Cleanup old sessions periodically
function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    // Remove closed sessions after TTL
    if (session.status === 'closed' && session.closedAt) {
      if (now - session.closedAt > CLOSED_SESSION_TTL_MS) {
        sessions.delete(id);
        continue;
      }
    }
    // Remove very old sessions
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

module.exports = {
  createSession,
  getSession,
  addMessage,
  markMessagesSeen,
  setStatus,
  setAdminSocket,
  listSessions,
  closeSession,
  setFeedback,
  setSessionMeta,
  deleteSession,
  addPageVisit
};
