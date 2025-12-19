const fs = require('fs');
const path = require('path');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const DEFAULT_TIMEOUT = 30000; // 30s for streaming
const QUICK_REPLY_TIMEOUT = 15000; // 15s for quick replies

// Cache for context files
const contextCache = new Map();

// Retry fetch with exponential backoff (aidj pattern)
async function retryFetch(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fn();
      return response;
    } catch (error) {
      // Don't retry on abort (timeout)
      if (error.name === 'AbortError') {
        throw error;
      }
      lastError = error;
      if (attempt === maxRetries) throw error;
      // Exponential backoff: 500ms, 1s, 2s
      const delay = Math.pow(2, attempt) * 500;
      console.log(`Ollama retry ${attempt}/${maxRetries} after ${delay}ms: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Create fetch with timeout using AbortController
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));
}

// Check if Ollama is available and model is loaded
async function checkModelAvailability(model = MODEL, timeoutMs = 5000) {
  try {
    const response = await fetchWithTimeout(
      `${OLLAMA_URL}/api/tags`,
      { method: 'GET' },
      timeoutMs
    );

    if (!response.ok) {
      return { available: false, error: 'Ollama not responding' };
    }

    const data = await response.json();
    const models = data.models || [];
    const modelExists = models.some(m => m.name === model || m.name.startsWith(`${model}:`));

    return {
      available: modelExists,
      error: modelExists ? null : `Model '${model}' not found`,
      models: models.map(m => m.name)
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return {
      available: false,
      error: isTimeout ? 'Ollama connection timeout' : `Ollama error: ${err.message}`
    };
  }
}

function loadContext(siteId) {
  // Check cache first
  if (contextCache.has(siteId)) {
    return contextCache.get(siteId);
  }

  // Try site-specific context first
  const contextsDir = path.join(__dirname, '..', 'contexts');
  const siteContextPath = path.join(contextsDir, `${siteId}.md`);

  try {
    if (fs.existsSync(siteContextPath)) {
      const content = fs.readFileSync(siteContextPath, 'utf-8');
      contextCache.set(siteId, content);
      return content;
    }
  } catch (err) {
    // Continue to fallback
  }

  // Try default context.md
  try {
    const defaultPath = path.join(__dirname, '..', 'context.md');
    const content = fs.readFileSync(defaultPath, 'utf-8');
    contextCache.set(siteId, content);
    return content;
  } catch (err) {
    const defaultPrompt = 'You are a helpful assistant answering questions for website visitors. Be concise and friendly.';
    contextCache.set(siteId, defaultPrompt);
    return defaultPrompt;
  }
}

// Clear cache periodically (every 5 minutes)
setInterval(() => contextCache.clear(), 5 * 60 * 1000);

async function streamResponse(messages, siteId, onChunk, onComplete, onError) {
  const systemPrompt = loadContext(siteId || 'default');

  // Build prompt from messages
  let prompt = '';
  for (const msg of messages) {
    if (msg.role === 'visitor') {
      prompt += `User: ${msg.content}\n`;
    } else if (msg.role === 'admin' || msg.role === 'ai') {
      prompt += `Assistant: ${msg.content}\n`;
    }
  }
  prompt += 'Assistant:';

  // AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DEFAULT_TIMEOUT);

  try {
    const response = await retryFetch(async () => {
      return fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          prompt,
          system: systemPrompt,
          stream: true
        }),
        signal: controller.signal
      });
    }, 2); // Only 2 retries for streaming since it takes longer

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Ollama HTTP ${response.status}: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    // Reset timeout for streaming phase
    clearTimeout(timeoutId);
    let streamTimeout;
    const resetStreamTimeout = () => {
      clearTimeout(streamTimeout);
      streamTimeout = setTimeout(() => {
        reader.cancel();
      }, 10000); // 10s between chunks
    };
    resetStreamTimeout();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        resetStreamTimeout(); // Reset on each chunk

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              fullResponse += data.response;
              onChunk(data.response);
            }
            if (data.done) {
              clearTimeout(streamTimeout);
              onComplete(fullResponse);
              return;
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      clearTimeout(streamTimeout);
      onComplete(fullResponse);
    } catch (streamErr) {
      clearTimeout(streamTimeout);
      throw streamErr;
    }
  } catch (err) {
    clearTimeout(timeoutId);

    // Categorize error for better handling
    if (err.name === 'AbortError') {
      onError(new Error('AI response timeout - please try again'));
    } else if (err.message.includes('ECONNREFUSED')) {
      onError(new Error('AI service unavailable - Ollama not running'));
    } else if (err.message.includes('HTTP 404')) {
      onError(new Error(`AI model '${MODEL}' not found`));
    } else {
      onError(err);
    }
  }
}

async function generateQuickReplies(messages, siteId) {
  const context = loadContext(siteId || 'default');

  // Build conversation summary
  let conversation = '';
  const recentMessages = messages.slice(-5);
  for (const msg of recentMessages) {
    if (msg.role === 'visitor') {
      conversation += `Visitor: ${msg.content}\n`;
    } else if (msg.role === 'admin' || msg.role === 'ai') {
      conversation += `Support: ${msg.content}\n`;
    }
  }

  const prompt = `Based on this context:
${context}

And this conversation:
${conversation}

Generate exactly 3 short, helpful reply options for the support agent. Each reply should be 1-2 sentences max.
Format: Return only the 3 replies, one per line, no numbering or bullets.`;

  try {
    const response = await retryFetch(async () => {
      return fetchWithTimeout(
        `${OLLAMA_URL}/api/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            prompt,
            stream: false
          })
        },
        QUICK_REPLY_TIMEOUT
      );
    }, 2);

    if (!response.ok) {
      console.error(`Quick replies failed: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    const replies = data.response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.length < 200)
      .slice(0, 3);

    return replies;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Quick replies timeout');
    } else {
      console.error('Quick replies error:', err.message);
    }
    return [];
  }
}

module.exports = {
  streamResponse,
  generateQuickReplies,
  checkModelAvailability,
  loadContext
};
