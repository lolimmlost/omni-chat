import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadDatabaseConfig, loadPoolConfig, toPostgresOptions } from './config.js';
import * as schema from './schema/index.js';

let dbInstance = null;
let sqlClient = null;

/**
 * Create database connection with pooling
 */
function createConnection() {
  const config = loadDatabaseConfig();
  const poolConfig = loadPoolConfig();
  const postgresOptions = toPostgresOptions(poolConfig);

  // Build connection string
  let connectionString;
  if (config.connectionString) {
    connectionString = config.connectionString;
  } else {
    const { user, password, host, port, database } = config;
    connectionString = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  // Create postgres client
  const sql = postgres(connectionString, {
    ...postgresOptions,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    transform: {
      undefined: null,
    },
    onnotice: () => {}, // Suppress notices in production
  });

  // Create drizzle instance
  const db = drizzle(sql, { schema });

  return { db, sql };
}

/**
 * Get database instance (singleton pattern)
 */
export function getDatabase() {
  if (!dbInstance) {
    const { db, sql } = createConnection();
    dbInstance = db;
    sqlClient = sql;
  }
  return dbInstance;
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  if (sqlClient) {
    await sqlClient.end();
    dbInstance = null;
    sqlClient = null;
  }
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth() {
  try {
    const db = getDatabase();
    await db.execute('SELECT 1');
    return { healthy: true, message: 'Database connection OK' };
  } catch (error) {
    return { healthy: false, message: error.message };
  }
}

// Export schema for convenience
export { schema };
