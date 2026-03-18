import { getDatabase } from '../db/index.js';
import { conversationSummaries, MessageRole } from '../db/schema/index.js';
import { sessionRepository, messageRepository } from '../repositories/index.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache for context files (cleared every 5 minutes)
const contextCache = new Map();
setInterval(() => contextCache.clear(), 5 * 60 * 1000);

export class ConversationManager {
  constructor(aiProvider) {
    this.aiProvider = aiProvider;
    this.db = getDatabase();
  }

  /**
   * Generate AI response for a session
   */
  async generateResponse(sessionId, siteConfig) {
    const context = await this.buildContext(sessionId, siteConfig);

    const request = {
      messages: context.messages,
      systemPrompt: context.systemPrompt,
      model: siteConfig.aiModel,
      temperature: siteConfig.responseSettings?.temperature || 0.7,
      maxTokens: siteConfig.responseSettings?.maxTokens || 500,
    };

    return await this.aiProvider.generate(request);
  }

  /**
   * Build context for AI request
   */
  async buildContext(sessionId, siteConfig) {
    // Load recent messages
    const messages = await messageRepository.getMessagesForAI(sessionId, 20);

    // Load conversation summary if exists and memory is enabled
    let summary = null;
    if (siteConfig.features?.conversationMemory) {
      summary = await this.getConversationSummary(sessionId);
    }

    // Load site-specific context
    let systemPrompt = this.loadContextFile(siteConfig.contextFile || 'default.md');

    // Add any custom system prompt prefix from site config
    if (siteConfig.responseSettings?.systemPromptPrefix) {
      systemPrompt = siteConfig.responseSettings.systemPromptPrefix + '\n\n' + systemPrompt;
    }

    // Add conversation summary to system prompt if available
    if (summary && siteConfig.features?.conversationMemory) {
      systemPrompt += `\n\n## Previous Conversation Summary\n${summary.summary}`;

      if (summary.keyTopics && summary.keyTopics.length > 0) {
        systemPrompt += `\n\nKey topics discussed: ${summary.keyTopics.join(', ')}`;
      }
    }

    return {
      messages,
      systemPrompt,
    };
  }

  /**
   * Load context file for a site
   */
  loadContextFile(contextFile) {
    // Check cache first
    if (contextCache.has(contextFile)) {
      return contextCache.get(contextFile);
    }

    // Try to load the specified context file
    const contextsDir = path.join(__dirname, '..', '..', 'contexts');
    const contextPath = path.join(contextsDir, contextFile);

    try {
      if (fs.existsSync(contextPath)) {
        const content = fs.readFileSync(contextPath, 'utf-8');
        contextCache.set(contextFile, content);
        return content;
      }
    } catch (err) {
      console.error(`Failed to load context file ${contextFile}:`, err.message);
    }

    // Try default context.md
    try {
      const defaultPath = path.join(__dirname, '..', '..', 'context.md');
      if (fs.existsSync(defaultPath)) {
        const content = fs.readFileSync(defaultPath, 'utf-8');
        contextCache.set(contextFile, content);
        return content;
      }
    } catch (err) {
      console.error('Failed to load default context:', err.message);
    }

    // Fallback to hardcoded default
    const defaultPrompt =
      'You are a helpful AI assistant for website visitors. Be concise, friendly, and accurate. If you don\'t know something, say so.';
    contextCache.set(contextFile, defaultPrompt);
    return defaultPrompt;
  }

  /**
   * Get conversation summary for session
   */
  async getConversationSummary(sessionId) {
    const [summary] = await this.db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.sessionId, sessionId))
      .limit(1);

    return summary || null;
  }

  /**
   * Generate conversation summary (called after every N messages)
   */
  async generateConversationSummary(sessionId, threshold = 10) {
    const messages = await messageRepository.getMessagesBySession(sessionId);

    // Only generate if we have enough messages
    if (messages.length < threshold) {
      return null;
    }

    // Check if we already have a recent summary
    const existingSummary = await this.getConversationSummary(sessionId);
    if (existingSummary && existingSummary.messageCount >= messages.length - 5) {
      // Summary is recent enough (within 5 messages)
      return existingSummary;
    }

    // Build conversation text
    const conversationText = messages
      .filter(m => m.role !== MessageRole.SYSTEM)
      .map(m => {
        const role = m.role === MessageRole.VISITOR ? 'Visitor' : 'Support';
        return `${role}: ${m.content}`;
      })
      .join('\n');

    // Generate summary using AI
    const summaryPrompt = `Summarize this customer support conversation in 2-3 concise sentences. Focus on the main issue, what was discussed, and current status:\n\n${conversationText}`;

    try {
      const response = await this.aiProvider.generate({
        messages: [
          {
            role: 'user',
            content: summaryPrompt,
          },
        ],
        systemPrompt: 'You are a conversation summarizer. Be concise and capture key points.',
        maxTokens: 200,
      });

      const summaryText = response.content;

      // Extract key topics (simple approach - could be enhanced)
      const keyTopics = this.extractKeyTopics(conversationText);

      // Determine sentiment (simple approach - could use AI)
      const sentiment = this.determineSentiment(conversationText);

      // Save or update summary
      await this.db
        .insert(conversationSummaries)
        .values({
          sessionId,
          summary: summaryText,
          keyTopics,
          sentiment,
          messageCount: messages.length,
          model: this.aiProvider.model || 'unknown',
        })
        .onConflictDoUpdate({
          target: conversationSummaries.sessionId,
          set: {
            summary: summaryText,
            keyTopics,
            sentiment,
            generatedAt: new Date(),
            messageCount: messages.length,
            model: this.aiProvider.model || 'unknown',
          },
        });

      return {
        summary: summaryText,
        keyTopics,
        sentiment,
        messageCount: messages.length,
      };
    } catch (err) {
      console.error('Failed to generate conversation summary:', err.message);
      return null;
    }
  }

  /**
   * Extract key topics from conversation (simple keyword extraction)
   */
  extractKeyTopics(conversationText) {
    // Simple approach: extract common nouns and important words
    // This could be enhanced with NLP libraries or AI-based extraction

    const words = conversationText.toLowerCase().split(/\W+/);

    // Filter out common words and short words
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'is',
      'are',
      'was',
      'were',
      'been',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'can',
      'may',
      'might',
      'must',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'this',
      'that',
      'these',
      'those',
      'my',
      'your',
      'his',
      'her',
      'its',
      'our',
      'their',
    ]);

    const wordFrequency = {};
    words.forEach(word => {
      if (word.length > 3 && !stopWords.has(word)) {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      }
    });

    // Get top 5 most frequent words as topics
    const topics = Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    return topics;
  }

  /**
   * Determine sentiment (simple keyword-based approach)
   */
  determineSentiment(conversationText) {
    const text = conversationText.toLowerCase();

    // Positive indicators
    const positiveWords = [
      'thank',
      'thanks',
      'great',
      'awesome',
      'perfect',
      'excellent',
      'good',
      'works',
      'solved',
      'fixed',
      'helped',
    ];

    // Negative indicators
    const negativeWords = [
      'problem',
      'issue',
      'error',
      'broken',
      'not working',
      'doesn\'t work',
      'frustrated',
      'annoying',
      'bad',
      'terrible',
      'worst',
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    positiveWords.forEach(word => {
      if (text.includes(word)) positiveCount++;
    });

    negativeWords.forEach(word => {
      if (text.includes(word)) negativeCount++;
    });

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Generate quick reply suggestions for admin
   */
  async generateQuickReplies(sessionId, siteConfig) {
    const messages = await messageRepository.getMessagesBySession(sessionId, 5);

    if (messages.length === 0) {
      return [];
    }

    // Build conversation summary for prompt
    const recentConversation = messages
      .map(m => {
        const role = m.role === MessageRole.VISITOR ? 'Visitor' : 'Support';
        return `${role}: ${m.content}`;
      })
      .join('\n');

    const context = this.loadContextFile(siteConfig.contextFile || 'default.md');

    const prompt = `Based on this context:
${context}

And this conversation:
${recentConversation}

Generate exactly 3 short, helpful reply options for the support agent. Each reply should be 1-2 sentences max.
Format: Return only the 3 replies, one per line, no numbering or bullets.`;

    try {
      const response = await this.aiProvider.generate({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        maxTokens: 300,
      });

      const replies = response.content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.length < 200)
        .slice(0, 3);

      return replies;
    } catch (err) {
      console.error('Failed to generate quick replies:', err.message);
      return [];
    }
  }
}
