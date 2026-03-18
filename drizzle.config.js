import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './server/db/schema/index.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5438/omni_chat',
  },
  verbose: true,
  strict: true,
});
