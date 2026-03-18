import 'dotenv/config';
import { OllamaProvider } from './providers/ollama-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { OpenRouterProvider } from './providers/openrouter-provider.js';
import { ProviderType } from './types.js';

// Singleton instances per provider type
const providers = new Map();

/**
 * Get or create a provider instance
 * @param {string} providerType - The type of provider (ollama, openai, anthropic, openrouter)
 * @param {Object} config - Optional configuration override
 * @returns {AIProvider}
 */
export function getProvider(providerType = null, config = null) {
  // Default to Ollama if no type specified
  const type = providerType || process.env.DEFAULT_AI_PROVIDER || ProviderType.OLLAMA;

  // Use cached provider if no custom config
  if (!config && providers.has(type)) {
    return providers.get(type);
  }

  // Create new provider
  const provider = createProvider(type, config);

  // Cache if using default config
  if (!config) {
    providers.set(type, provider);
  }

  return provider;
}

/**
 * Create a new provider instance
 * @param {string} type - Provider type
 * @param {Object} config - Optional configuration
 * @returns {AIProvider}
 */
function createProvider(type, config = null) {
  switch (type) {
    case ProviderType.OLLAMA:
      return new OllamaProvider(
        config?.url || process.env.OLLAMA_URL || 'http://localhost:11434',
        config?.model || process.env.OLLAMA_MODEL || 'llama3.2'
      );

    case ProviderType.OPENAI:
      return new OpenAIProvider(
        config?.apiKey || process.env.OPENAI_API_KEY,
        config?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        config?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
      );

    case ProviderType.ANTHROPIC:
      return new AnthropicProvider(
        config?.apiKey || process.env.ANTHROPIC_API_KEY,
        config?.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
        config?.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250514'
      );

    case ProviderType.OPENROUTER:
      return new OpenRouterProvider(
        config?.apiKey || process.env.OPENROUTER_API_KEY,
        config?.model || process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet',
        config?.siteUrl || process.env.OPENROUTER_SITE_URL || '',
        config?.siteName || process.env.OPENROUTER_SITE_NAME || 'OmniChat'
      );

    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Get provider from site configuration
 * @param {Object} siteConfig - Site configuration object
 * @returns {AIProvider}
 */
export function getProviderForSite(siteConfig) {
  if (!siteConfig) {
    return getProvider(ProviderType.OLLAMA);
  }

  const type = siteConfig.aiProvider || ProviderType.OLLAMA;
  const config = {
    model: siteConfig.aiModel,
  };

  // Add provider-specific configuration
  switch (type) {
    case ProviderType.OLLAMA:
      config.url = process.env.OLLAMA_URL;
      break;

    case ProviderType.OPENAI:
      config.apiKey = process.env.OPENAI_API_KEY;
      config.baseUrl = process.env.OPENAI_BASE_URL;
      break;

    case ProviderType.ANTHROPIC:
      config.apiKey = process.env.ANTHROPIC_API_KEY;
      config.baseUrl = process.env.ANTHROPIC_BASE_URL;
      break;

    case ProviderType.OPENROUTER:
      config.apiKey = process.env.OPENROUTER_API_KEY;
      config.siteUrl = process.env.OPENROUTER_SITE_URL;
      config.siteName = process.env.OPENROUTER_SITE_NAME;
      break;
  }

  return getProvider(type, config);
}

/**
 * Check availability of all configured providers
 * @returns {Promise<Object>} Status of all providers
 */
export async function checkAllProviders() {
  const results = {};

  for (const type of Object.values(ProviderType)) {
    try {
      const provider = getProvider(type);

      if (!provider.isConfigured()) {
        results[type] = {
          configured: false,
          available: false,
          message: 'Not configured',
        };
        continue;
      }

      const status = await provider.checkAvailability();
      results[type] = {
        configured: true,
        ...status,
      };
    } catch (err) {
      results[type] = {
        configured: false,
        available: false,
        error: err.message,
      };
    }
  }

  return results;
}

/**
 * Reset all cached provider instances
 * Useful when configuration changes
 */
export function resetProviders() {
  providers.clear();
}

/**
 * Get list of all available provider types
 */
export function getAvailableProviderTypes() {
  return Object.values(ProviderType);
}

// Export provider types for convenience
export { ProviderType };
