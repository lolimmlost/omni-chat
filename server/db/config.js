import 'dotenv/config';

/**
 * Load database configuration from environment variables
 */
export function loadDatabaseConfig() {
  // If DATABASE_URL is provided, use it
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true',
    };
  }

  // Otherwise, build from individual components
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5438', 10),
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'omni_chat',
    ssl: process.env.DB_SSL === 'true',
  };

  return config;
}

/**
 * Load connection pool configuration
 */
export function loadPoolConfig() {
  return {
    max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    min: parseInt(process.env.DB_MIN_CONNECTIONS || '2', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '10000', 10),
  };
}

/**
 * Convert pool config to postgres-js options
 */
export function toPostgresOptions(poolConfig) {
  return {
    max: poolConfig.max,
    idle_timeout: Math.floor(poolConfig.idleTimeout / 1000), // postgres-js uses seconds
    connect_timeout: Math.floor(poolConfig.connectionTimeout / 1000),
    max_lifetime: 1800, // 30 minutes default
  };
}
