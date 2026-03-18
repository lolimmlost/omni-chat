import { AIProvider, ProviderError, ErrorType } from '../types.js';

export class OpenRouterProvider extends AIProvider {
  constructor(
    apiKey,
    model = 'anthropic/claude-3-5-sonnet',
    siteUrl = '',
    siteName = 'OmniChat'
  ) {
    super();
    this.name = 'OpenRouter';
    this.type = 'openrouter';
    this.apiKey = apiKey;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.model = model;
    this.siteUrl = siteUrl;
    this.siteName = siteName;
  }

  /**
   * Check if provider is configured
   */
  isConfigured() {
    return !!this.apiKey && !!this.model;
  }

  /**
   * Get provider metadata
   */
  getMetadata() {
    return {
      name: this.name,
      type: this.type,
      supportsStreaming: true,
      supportsSystemPrompt: true,
      models: [
        this.model,
        'anthropic/claude-3-5-sonnet',
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'google/gemini-pro',
      ],
    };
  }

  /**
   * Check if OpenRouter API is available
   */
  async checkAvailability() {
    if (!this.isConfigured()) {
      return {
        available: false,
        error: 'OpenRouter API key not configured',
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return {
            available: false,
            error: 'Invalid OpenRouter API key',
          };
        }
        return {
          available: false,
          error: `OpenRouter API error: ${response.status}`,
        };
      }

      return {
        available: true,
        message: `OpenRouter available with model ${this.model}`,
      };
    } catch (err) {
      return {
        available: false,
        error: `OpenRouter connection error: ${err.message}`,
      };
    }
  }

  /**
   * Generate a response (non-streaming)
   */
  async generate(request) {
    const { messages, systemPrompt, model, temperature, maxTokens } = request;

    const formattedMessages = this.formatMessages(messages, systemPrompt);

    try {
      const response = await this.retryFetch(async () => {
        return fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            model: model || this.model,
            messages: formattedMessages,
            temperature: temperature !== undefined ? temperature : 0.7,
            max_tokens: maxTokens || 500,
            stream: false,
          }),
        });
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createError(response.status, errorData);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      return {
        content,
        metadata: {
          model: data.model,
          tokenCount: data.usage?.total_tokens,
          finishReason: data.choices?.[0]?.finish_reason,
        },
      };
    } catch (err) {
      throw this.handleError(err);
    }
  }

  /**
   * Generate a streaming response
   */
  async streamGenerate(request, callbacks) {
    const { messages, systemPrompt, model, temperature, maxTokens } = request;
    const { onChunk, onComplete, onError } = callbacks;

    const formattedMessages = this.formatMessages(messages, systemPrompt);

    try {
      const response = await this.retryFetch(async () => {
        return fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            model: model || this.model,
            messages: formattedMessages,
            temperature: temperature !== undefined ? temperature : 0.7,
            max_tokens: maxTokens || 500,
            stream: true,
          }),
        });
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createError(response.status, errorData);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let finishReason = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk
            .split('\n')
            .filter(line => line.trim().startsWith('data: '));

          for (const line of lines) {
            const data = line.replace('data: ', '').trim();

            if (data === '[DONE]') {
              onComplete(fullResponse, {
                model: model || this.model,
                finishReason: finishReason || 'stop',
              });
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              const finish = parsed.choices?.[0]?.finish_reason;

              if (content) {
                fullResponse += content;
                onChunk(content);
              }

              if (finish) {
                finishReason = finish;
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }

        onComplete(fullResponse, {
          model: model || this.model,
          finishReason: finishReason || 'stop',
        });
      } catch (streamErr) {
        throw streamErr;
      }
    } catch (err) {
      const handledError = this.handleError(err);
      onError(handledError);
    }
  }

  /**
   * Get headers for OpenRouter requests
   * OpenRouter requires HTTP-Referer and X-Title headers
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    if (this.siteUrl) {
      headers['HTTP-Referer'] = this.siteUrl;
    }

    if (this.siteName) {
      headers['X-Title'] = this.siteName;
    }

    return headers;
  }

  /**
   * Format messages for OpenRouter API (OpenAI-compatible)
   */
  formatMessages(messages, systemPrompt) {
    const formatted = [];

    if (systemPrompt) {
      formatted.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      formatted.push({
        role: msg.role, // Already in OpenAI format (user/assistant)
        content: msg.content,
      });
    }

    return formatted;
  }

  /**
   * Retry fetch with exponential backoff
   */
  async retryFetch(fn, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fn();

        // Retry on rate limit (429)
        if (response.status === 429 && attempt < maxRetries) {
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
          console.log(`OpenRouter rate limit, retrying after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) throw error;

        const delay = Math.pow(2, attempt) * 1000;
        console.log(`OpenRouter retry ${attempt}/${maxRetries} after ${delay}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Create error from response
   */
  createError(status, errorData) {
    const message = errorData.error?.message || 'OpenRouter API error';

    if (status === 401) {
      return new ProviderError(
        'Invalid API key',
        ErrorType.INVALID_API_KEY,
        this.type
      );
    }

    if (status === 429) {
      return new ProviderError(
        'Rate limit exceeded',
        ErrorType.RATE_LIMIT,
        this.type
      );
    }

    if (status === 400) {
      return new ProviderError(
        message,
        ErrorType.INVALID_REQUEST,
        this.type
      );
    }

    return new ProviderError(
      message,
      ErrorType.UNKNOWN,
      this.type
    );
  }

  /**
   * Handle and categorize errors
   */
  handleError(err) {
    if (err instanceof ProviderError) {
      return err;
    }

    if (err.name === 'AbortError') {
      return new ProviderError(
        'Request timeout',
        ErrorType.TIMEOUT,
        this.type
      );
    }

    return new ProviderError(
      err.message || 'Unknown OpenRouter error',
      ErrorType.UNKNOWN,
      this.type
    );
  }
}
