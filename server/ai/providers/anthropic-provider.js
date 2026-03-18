import { AIProvider, ProviderError, ErrorType } from '../types.js';

export class AnthropicProvider extends AIProvider {
  constructor(
    apiKey,
    baseUrl = 'https://api.anthropic.com/v1',
    model = 'claude-sonnet-4-5-20250514'
  ) {
    super();
    this.name = 'Anthropic';
    this.type = 'anthropic';
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.apiVersion = '2023-06-01';
  }

  /**
   * Check if provider is configured
   */
  isConfigured() {
    return !!this.apiKey && !!this.baseUrl && !!this.model;
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
        'claude-sonnet-4-5-20250514',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
      ],
    };
  }

  /**
   * Check if Anthropic API is available
   */
  async checkAvailability() {
    if (!this.isConfigured()) {
      return {
        available: false,
        error: 'Anthropic API key not configured',
      };
    }

    // Anthropic doesn't have a simple health check endpoint
    // We'll just verify the key format
    if (!this.apiKey.startsWith('sk-ant-')) {
      return {
        available: false,
        error: 'Invalid Anthropic API key format',
      };
    }

    return {
      available: true,
      message: `Anthropic available with model ${this.model}`,
    };
  }

  /**
   * Generate a response (non-streaming)
   */
  async generate(request) {
    const { messages, systemPrompt, model, temperature, maxTokens } = request;

    const { systemMessages, conversationMessages } = this.formatMessages(messages, systemPrompt);

    try {
      const response = await this.retryFetch(async () => {
        return fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion,
          },
          body: JSON.stringify({
            model: model || this.model,
            messages: conversationMessages,
            system: systemMessages,
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
      const content = data.content?.[0]?.text || '';

      return {
        content,
        metadata: {
          model: data.model,
          tokenCount: data.usage?.input_tokens + data.usage?.output_tokens,
          finishReason: data.stop_reason,
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

    const { systemMessages, conversationMessages } = this.formatMessages(messages, systemPrompt);

    try {
      const response = await this.retryFetch(async () => {
        return fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion,
          },
          body: JSON.stringify({
            model: model || this.model,
            messages: conversationMessages,
            system: systemMessages,
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
      let stopReason = null;

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

            try {
              const parsed = JSON.parse(data);

              // Handle different event types
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text;
                if (text) {
                  fullResponse += text;
                  onChunk(text);
                }
              } else if (parsed.type === 'message_delta') {
                stopReason = parsed.delta?.stop_reason;
              } else if (parsed.type === 'message_stop') {
                onComplete(fullResponse, {
                  model: model || this.model,
                  finishReason: stopReason || 'end_turn',
                });
                return;
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }

        onComplete(fullResponse, {
          model: model || this.model,
          finishReason: stopReason || 'end_turn',
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
   * Format messages for Anthropic API
   * Anthropic requires system prompts as a separate parameter
   */
  formatMessages(messages, systemPrompt) {
    const conversationMessages = [];

    for (const msg of messages) {
      // Skip system messages - they go in the system parameter
      if (msg.role === 'system') {
        continue;
      }

      conversationMessages.push({
        role: msg.role, // user or assistant
        content: msg.content,
      });
    }

    return {
      systemMessages: systemPrompt || undefined,
      conversationMessages,
    };
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
          console.log(`Anthropic rate limit, retrying after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) throw error;

        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Anthropic retry ${attempt}/${maxRetries} after ${delay}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Create error from response
   */
  createError(status, errorData) {
    const message = errorData.error?.message || 'Anthropic API error';

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
      err.message || 'Unknown Anthropic error',
      ErrorType.UNKNOWN,
      this.type
    );
  }
}
