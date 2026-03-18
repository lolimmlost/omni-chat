#!/usr/bin/env node

/**
 * Test Database Connection
 *
 * Quick script to verify database connection and AI providers
 */

import 'dotenv/config';
import { checkDatabaseHealth, closeDatabase } from './server/db/index.js';
import { checkAllProviders } from './server/ai/factory.js';

async function testConnection() {
  console.log('🔍 Testing Omni-Chat Configuration...\n');

  // Test database
  console.log('📊 Database Connection:');
  console.log(`   URL: ${process.env.DATABASE_URL || 'Not configured'}`);

  const dbHealth = await checkDatabaseHealth();
  if (dbHealth.healthy) {
    console.log('   ✅ Database connection successful!\n');
  } else {
    console.log(`   ❌ Database connection failed: ${dbHealth.message}\n`);
  }

  // Test AI providers
  console.log('🤖 AI Provider Status:');
  const providers = await checkAllProviders();

  for (const [type, status] of Object.entries(providers)) {
    const icon = status.available ? '✅' : status.configured ? '⚠️' : '❌';
    const message = status.message || status.error || 'Not configured';
    console.log(`   ${icon} ${type.toUpperCase()}: ${message}`);
  }

  console.log('\n📝 Configuration Summary:');
  console.log(`   USE_DATABASE: ${process.env.USE_DATABASE || 'false'}`);
  console.log(`   MULTI_PROVIDER: ${process.env.MULTI_PROVIDER || 'false'}`);
  console.log(`   CONVERSATION_MEMORY: ${process.env.CONVERSATION_MEMORY || 'false'}`);
  console.log(`   CONTENT_FILTERING: ${process.env.CONTENT_FILTERING || 'false'}`);

  console.log('\n✨ Test complete!\n');

  await closeDatabase();
  process.exit(0);
}

testConnection().catch(err => {
  console.error('❌ Test failed:', err.message);
  console.error(err);
  process.exit(1);
});
