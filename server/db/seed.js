import 'dotenv/config';
import { getDatabase, closeDatabase } from './index.js';
import { sites, cannedResponses } from './schema/index.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

async function seed() {
  console.log('🌱 Seeding database...');

  const db = getDatabase();

  try {
    // Seed default site
    const existingDefault = await db
      .select()
      .from(sites)
      .where(eq(sites.id, 'default'))
      .limit(1);

    if (existingDefault.length === 0) {
      await db.insert(sites).values({
        id: 'default',
        name: 'Default Site',
        enabled: 1,
        aiProvider: 'ollama',
        aiModel: 'llama3.2',
        contextFile: 'default.md',
        features: {
          aiEnabled: true,
          conversationMemory: true,
          contentFiltering: false,
          webhooks: true,
        },
        webhooks: {
          url: '',
          events: ['waiting_human', 'new_session'],
        },
        branding: {
          name: 'Support Chat',
          color: '#00d9ff',
        },
        responseSettings: {
          temperature: 0.7,
          maxTokens: 500,
          systemPromptPrefix: '',
        },
      });
      console.log('✅ Created default site configuration');
    } else {
      console.log('ℹ️  Default site already exists');
    }

    // Seed appahouse site
    const existingAppahouse = await db
      .select()
      .from(sites)
      .where(eq(sites.id, 'appahouse'))
      .limit(1);

    if (existingAppahouse.length === 0) {
      await db.insert(sites).values({
        id: 'appahouse',
        name: 'AppaHouse Portfolio',
        enabled: 1,
        aiProvider: 'ollama',
        aiModel: 'llama3.2',
        contextFile: 'appahouse.md',
        features: {
          aiEnabled: true,
          conversationMemory: true,
          contentFiltering: false,
          webhooks: false,
        },
        webhooks: {
          url: '',
          events: [],
        },
        branding: {
          name: 'AppaHouse Chat',
          color: '#00d9ff',
        },
        responseSettings: {
          temperature: 0.8,
          maxTokens: 600,
          systemPromptPrefix: '',
        },
      });
      console.log('✅ Created appahouse site configuration');
    } else {
      console.log('ℹ️  AppaHouse site already exists');
    }

    // Seed canned responses
    const existingResponses = await db.select().from(cannedResponses).limit(1);

    if (existingResponses.length === 0) {
      const responses = [
        {
          id: nanoid(),
          text: 'Hello! How can I help you today?',
          category: 'greeting',
        },
        {
          id: nanoid(),
          text: 'Thanks for reaching out! Let me look into that for you.',
          category: 'general',
        },
        {
          id: nanoid(),
          text: 'Is there anything else I can help you with?',
          category: 'general',
        },
        {
          id: nanoid(),
          text: 'Thank you for your patience. Let me connect you with someone who can better assist you.',
          category: 'escalation',
        },
        {
          id: nanoid(),
          text: 'Have a great day! Feel free to reach out if you need anything else.',
          category: 'closing',
        },
      ];

      await db.insert(cannedResponses).values(responses);
      console.log(`✅ Created ${responses.length} canned responses`);
    } else {
      console.log('ℹ️  Canned responses already exist');
    }

    console.log('🎉 Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

seed();
