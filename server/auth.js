const crypto = require('crypto');

// Timing-safe token comparison to prevent timing attacks
function verifyToken(token) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    console.warn('Warning: ADMIN_TOKEN not set in environment');
    return false;
  }

  if (typeof token !== 'string' || token.length === 0) {
    return false;
  }

  // Pad to same length to prevent length-based timing attacks
  const tokenBuf = Buffer.from(token.padEnd(256, '\0'));
  const adminBuf = Buffer.from(adminToken.padEnd(256, '\0'));

  try {
    return crypto.timingSafeEqual(tokenBuf, adminBuf);
  } catch {
    return false;
  }
}

function authMiddleware(req, res, next) {
  // Only accept token from header, not query string (security)
  const token = req.headers['x-admin-token'];
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = {
  verifyToken,
  authMiddleware
};
