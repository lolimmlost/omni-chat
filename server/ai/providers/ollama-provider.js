import { AIProvider, ProviderError, ErrorType } from '../types.js';

export class OllamaProvider extends AIProvider {
  constructor(url = 'http://localhost:11434', model = 'llama3.2') {
    super();
    this.name = 'Ollama';
    this.type = 'ollama';
    this.url = url;
    this.model = model;
    this.defaultTimeout = 30000; // 30s for streaming
    this.quickReplyTimeout = 15000; // 15s for quick replies
  }

  /**
   * Check if provider is configured
   */
  isConfigured() {
    return !!this.url && !!this.model;
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
      models: [this.model],
    };
  }

  /**
   * Check if Ollama is available and model is loaded
   */
  async checkAvailability() {
    try {
      const response = await this.fetchWithTimeout(
        `${this.url}/api/tags`,
        { method: 'GET' },
        5000
      );

      if (!response.ok) {
        return {
          available: false,
          error: 'Ollama not responding',
        };
      }

      const data = await response.json();
      const models = data.models || [];
      const modelExists = models.some(
        m => m.name === this.model || m.name.startsWith(`${this.model}:`)
      );

      return {
        available: modelExists,
        error: modelExists ? null : `Model '${this.model}' not found`,
        message: modelExists
          ? `Ollama available with model ${this.model}`
          : `Model ${this.model} not found`,
      };
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      return {
        available: false,
        error: isTimeout
          ? 'Ollama connection timeout'
          : `Ollama error: ${err.message}`,
      };
    }
  }

  /**
   * Generate a response (non-streaming)
   */
  async generate(request) {
    const { messages, systemPrompt, model, temperature } = request;

    const prompt = this.buildPrompt(messages);

    try {
      const response = await this.retryFetch(async () => {
        return this.fetchWithTimeout(
          `${this.url}/api/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model || this.model,
              prompt,
              system: systemPrompt,
              stream: false,
              options: temperature ? { temperature } : undefined,
            }),
          },
          this.quickReplyTimeout
        );
      }, 3);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new ProviderError(
          `Ollama HTTP ${response.status}: ${errorText}`,
          ErrorType.UNKNOWN,
          this.type
        );
      }

      const data = await response.json();

      return {
        content: data.response || '',
        metadata: {
          model: model || this.model,
          finishReason: 'complete',
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

    const prompt = this.buildPrompt(messages);

    // AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.defaultTimeout);

    try {
      const response = await this.retryFetch(async () => {
        return fetch(`${this.url}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || this.model,
            prompt,
            system: systemPrompt,
            stream: true,
            options: {
              temperature: temperature !== undefined ? temperature : 0.7,
              num_predict: maxTokens,
            },
          }),
          signal: controller.signal,
        });
      }, 2); // Only 2 retries for streaming

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new ProviderError(
          `Ollama HTTP ${response.status}: ${errorText}`,
          ErrorType.UNKNOWN,
          this.type
        );
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
                onComplete(fullResponse, {
                  model: model || this.model,
                  finishReason: 'complete',
                });
                return;
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }

        clearTimeout(streamTimeout);
        onComplete(fullResponse, {
          model: model || this.model,
          finishReason: 'complete',
        });
      } catch (streamErr) {
        clearTimeout(streamTimeout);
        throw streamErr;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const handledError = this.handleError(err);
      onError(handledError);
    }
  }

  /**
   * Build prompt from messages array
   */
  buildPrompt(messages) {
    let prompt = '';
    for (const msg of messages) {
      if (msg.role === 'user') {
        prompt += `User: ${msg.content}\n`;
      } else if (msg.role === 'assistant') {
        prompt += `Assistant: ${msg.content}\n`;
      }
    }
    prompt += 'Assistant:';
    return prompt;
  }

  /**
   * Fetch with timeout using AbortController
   */
  fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
      ...options,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
  }

  /**
   * Retry fetch with exponential backoff
   */
  async retryFetch(fn, maxRetries = 3) {
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
        const delay = Math.pow(2, attempt - 1) * 500;
        console.log(
          `Ollama retry ${attempt}/${maxRetries} after ${delay}ms: ${error.message}`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
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
        'AI response timeout - please try again',
        ErrorType.TIMEOUT,
        this.type
      );
    }

    if (err.message.includes('ECONNREFUSED')) {
      return new ProviderError(
        'AI service unavailable - Ollama not running',
        ErrorType.CONNECTION_REFUSED,
        this.type
      );
    }

    if (err.message.includes('HTTP 404')) {
      return new ProviderError(
        `AI model '${this.model}' not found`,
        ErrorType.MODEL_NOT_FOUND,
        this.type
      );
    }

    return new ProviderError(
      err.message || 'Unknown Ollama error',
      ErrorType.UNKNOWN,
      this.type
    );
  }
}
