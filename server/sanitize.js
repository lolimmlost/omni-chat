// Security: Input sanitization and rate limiting

const MAX_MESSAGE_LENGTH = 2000;
const MAX_SITE_ID_LENGTH = 50;
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 20;
const MAX_CONNECTIONS_PER_IP = 5;

// Track message rates per session
const messageRates = new Map(); // sessionId -> { count, windowStart }

// Track connections per IP
const connectionsByIp = new Map(); // ip -> Set of socketIds

// Sanitize text input - strip HTML and control characters
function sanitizeText(input) {
  if (typeof input !== 'string') return '';

  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove control characters except newlines
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Trim whitespace
    .trim()
    // Limit length
    .slice(0, MAX_MESSAGE_LENGTH);
}

// Sanitize site ID - alphanumeric, hyphens, underscores only
function sanitizeSiteId(input) {
  if (typeof input !== 'string') return 'default';

  return input
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .slice(0, MAX_SITE_ID_LENGTH) || 'default';
}

// Check rate limit for a session
function checkRateLimit(sessionId) {
  const now = Date.now();
  let rate = messageRates.get(sessionId);

  if (!rate || now - rate.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window
    rate = { count: 1, windowStart: now };
    messageRates.set(sessionId, rate);
    return true;
  }

  if (rate.count >= MAX_MESSAGES_PER_WINDOW) {
    return false; // Rate limited
  }

  rate.count++;
  return true;
}

// Track connection for IP
function trackConnection(ip, socketId) {
  if (!connectionsByIp.has(ip)) {
    connectionsByIp.set(ip, new Set());
  }
  const connections = connectionsByIp.get(ip);

  if (connections.size >= MAX_CONNECTIONS_PER_IP) {
    return false; // Too many connections
  }

  connections.add(socketId);
  return true;
}

// Remove connection tracking
function removeConnection(ip, socketId) {
  const connections = connectionsByIp.get(ip);
  if (connections) {
    connections.delete(socketId);
    if (connections.size === 0) {
      connectionsByIp.delete(ip);
    }
  }
}

// Clean up old rate limit entries periodically
function cleanupRateLimits() {
  const now = Date.now();
  for (const [sessionId, rate] of messageRates.entries()) {
    if (now - rate.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      messageRates.delete(sessionId);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);

module.exports = {
  sanitizeText,
  sanitizeSiteId,
  checkRateLimit,
  trackConnection,
  removeConnection,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES_PER_WINDOW
};
