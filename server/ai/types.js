/**
 * AI Provider Types and Interfaces
 *
 * This file defines the structure for AI providers to ensure
 * consistent implementation across Ollama, OpenAI, Anthropic, etc.
 */

/**
 * Message format for AI requests
 * @typedef {Object} AIMessage
 * @property {'user'|'assistant'|'system'} role - The role of the message sender
 * @property {string} content - The message content
 * @property {number} [timestamp] - Optional timestamp
 */

/**
 * Request configuration for AI generation
 * @typedef {Object} GenerateRequest
 * @property {AIMessage[]} messages - Conversation messages
 * @property {string} [systemPrompt] - System prompt/context
 * @property {string} [model] - Model name to use
 * @property {number} [temperature] - Sampling temperature (0-2)
 * @property {number} [maxTokens] - Maximum tokens to generate
 * @property {boolean} [stream] - Whether to stream the response
 */

/**
 * Callbacks for streaming responses
 * @typedef {Object} StreamCallbacks
 * @property {function(string): void} onChunk - Called for each chunk of text
 * @property {function(string, Object): void} onComplete - Called when complete with full response and metadata
 * @property {function(Error): void} onError - Called if an error occurs
 */

/**
 * Response metadata
 * @typedef {Object} ResponseMetadata
 * @property {number} [tokenCount] - Total tokens used
 * @property {number} [duration] - Response time in ms
 * @property {string} [model] - Model that generated the response
 * @property {string} [finishReason] - Why generation stopped
 */

/**
 * Provider availability status
 * @typedef {Object} AvailabilityStatus
 * @property {boolean} available - Whether provider is available
 * @property {string} [message] - Status message
 * @property {string} [error] - Error message if unavailable
 */

/**
 * Provider metadata
 * @typedef {Object} ProviderMetadata
 * @property {string} name - Provider name
 * @property {string} type - Provider type
 * @property {boolean} supportsStreaming - Whether streaming is supported
 * @property {boolean} supportsSystemPrompt - Whether system prompts are supported
 * @property {string[]} models - Available models
 */

/**
 * Base AI Provider Interface
 * All providers must implement these methods
 */
export class AIProvider {
  /**
   * Provider name
   * @type {string}
   */
  name = 'base';

  /**
   * Provider type
   * @type {'ollama'|'openai'|'anthropic'|'openrouter'}
   */
  type = 'ollama';

  /**
   * Generate a response (non-streaming)
   * @param {GenerateRequest} request - The generation request
   * @returns {Promise<{content: string, metadata: ResponseMetadata}>}
   */
  async generate(request) {
    throw new Error('generate() must be implemented by provider');
  }

  /**
   * Generate a streaming response
   * @param {GenerateRequest} request - The generation request
   * @param {StreamCallbacks} callbacks - Streaming callbacks
   * @returns {Promise<void>}
   */
  async streamGenerate(request, callbacks) {
    throw new Error('streamGenerate() must be implemented by provider');
  }

  /**
   * Check if provider is available and configured
   * @returns {Promise<AvailabilityStatus>}
   */
  async checkAvailability() {
    throw new Error('checkAvailability() must be implemented by provider');
  }

  /**
   * Check if provider is properly configured
   * @returns {boolean}
   */
  isConfigured() {
    throw new Error('isConfigured() must be implemented by provider');
  }

  /**
   * Get provider metadata
   * @returns {ProviderMetadata}
   */
  getMetadata() {
    return {
      name: this.name,
      type: this.type,
      supportsStreaming: true,
      supportsSystemPrompt: true,
      models: [],
    };
  }
}

/**
 * Provider types enum
 */
export const ProviderType = {
  OLLAMA: 'ollama',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  OPENROUTER: 'openrouter',
};

/**
 * Error types for provider errors
 */
export class ProviderError extends Error {
  constructor(message, type = 'unknown', provider = 'unknown') {
    super(message);
    this.name = 'ProviderError';
    this.type = type;
    this.provider = provider;
  }
}

export const ErrorType = {
  TIMEOUT: 'timeout',
  CONNECTION_REFUSED: 'connection_refused',
  MODEL_NOT_FOUND: 'model_not_found',
  RATE_LIMIT: 'rate_limit',
  INVALID_API_KEY: 'invalid_api_key',
  INVALID_REQUEST: 'invalid_request',
  UNKNOWN: 'unknown',
};
