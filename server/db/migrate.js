import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadDatabaseConfig } from './config.js';

async function runMigrations() {
  console.log('🔄 Starting database migrations...');

  try {
    const config = loadDatabaseConfig();

    // Build connection string
    let connectionString;
    if (config.connectionString) {
      connectionString = config.connectionString;
    } else {
      const { user, password, host, port, database } = config;
      connectionString = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
    }

    // Create a connection for migrations (single connection, not pooled)
    const migrationClient = postgres(connectionString, {
      max: 1,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
    });

    const db = drizzle(migrationClient);

    // Run migrations
    await migrate(db, { migrationsFolder: './drizzle' });

    console.log('✅ Migrations completed successfully!');

    // Close connection
    await migrationClient.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
