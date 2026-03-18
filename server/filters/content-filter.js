/**
 * Content Filter
 *
 * Filters inappropriate content, spam, and PII from user messages
 */

export class ContentFilter {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.mode = config.mode || 'flag'; // 'block', 'flag', or 'moderate'
    this.patterns = this.loadPatterns(config.patterns);
  }

  /**
   * Load filter patterns
   */
  loadPatterns(customPatterns = {}) {
    const defaultPatterns = {
      // Spam patterns
      spam: [
        /\b(buy now|click here|limited offer|act now|free money|earn \$|make money fast)\b/gi,
        /\b(viagra|cialis|pharmacy)\b/gi,
        /(http[s]?:\/\/[^\s]+){3,}/gi, // Multiple URLs
      ],

      // PII patterns (optional - usually disabled for support chats)
      pii: [
        /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
      ],

      // Profanity (basic list - should be expanded based on use case)
      profanity: [
        // Add specific words as needed
        // This is intentionally minimal - customize per use case
      ],

      // Malicious patterns
      malicious: [
        /<script[\s\S]*?>[\s\S]*?<\/script>/gi, // Script tags
        /javascript:/gi,
        /on\w+\s*=/gi, // Event handlers
      ],
    };

    return {
      spam: customPatterns.spam || defaultPatterns.spam,
      pii: customPatterns.pii || defaultPatterns.pii,
      profanity: customPatterns.profanity || defaultPatterns.profanity,
      malicious: customPatterns.malicious || defaultPatterns.malicious,
    };
  }

  /**
   * Filter a message
   * @param {string} content - Message content
   * @param {Object} context - Additional context (sessionId, siteId, etc.)
   * @returns {Promise<Object>} Filter result
   */
  async filterMessage(content, context = {}) {
    if (!this.enabled) {
      return {
        allowed: true,
        flagged: false,
        violations: [],
        cleanedContent: content,
      };
    }

    const violations = [];

    // Check each pattern category
    for (const [category, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          violations.push({
            category,
            pattern: pattern.source,
            match: content.match(pattern)?.[0],
          });
        }
      }
    }

    // Determine action based on mode
    let allowed = true;
    let cleanedContent = content;

    if (violations.length > 0) {
      switch (this.mode) {
        case 'block':
          allowed = false;
          break;

        case 'moderate':
          cleanedContent = this.cleanContent(content, violations);
          break;

        case 'flag':
        default:
          // Allow but flag for review
          allowed = true;
          break;
      }
    }

    return {
      allowed,
      flagged: violations.length > 0,
      violations,
      cleanedContent,
    };
  }

  /**
   * Clean content by removing or replacing flagged patterns
   */
  cleanContent(content, violations) {
    let cleaned = content;

    for (const violation of violations) {
      // Reconstruct pattern from source
      const pattern = new RegExp(violation.pattern, 'gi');

      switch (violation.category) {
        case 'malicious':
          // Remove completely
          cleaned = cleaned.replace(pattern, '[REMOVED]');
          break;

        case 'pii':
          // Redact
          cleaned = cleaned.replace(pattern, '[REDACTED]');
          break;

        case 'profanity':
          // Replace with asterisks
          cleaned = cleaned.replace(pattern, match => '*'.repeat(match.length));
          break;

        case 'spam':
          // Flag but don't modify
          break;

        default:
          break;
      }
    }

    return cleaned;
  }

  /**
   * Check if content is spam (quick check)
   */
  isSpam(content) {
    for (const pattern of this.patterns.spam) {
      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if content contains PII
   */
  containsPII(content) {
    for (const pattern of this.patterns.pii) {
      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if content is malicious
   */
  isMalicious(content) {
    for (const pattern of this.patterns.malicious) {
      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Create default content filter instance
 */
export function createContentFilter(siteConfig) {
  const config = {
    enabled: siteConfig.features?.contentFiltering || false,
    mode: siteConfig.contentFilter?.mode || 'flag',
    patterns: siteConfig.contentFilter?.patterns || {},
  };

  return new ContentFilter(config);
}
