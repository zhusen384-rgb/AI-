import { sql } from "drizzle-orm";
import { getDb } from "coze-coding-dev-sdk";

export async function ensureChatbotTables(): Promise<void> {
  const db = await getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
      title VARCHAR(200),
      current_page VARCHAR(255),
      user_agent TEXT,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant_id ON chat_sessions(tenant_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR(36) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      message_type VARCHAR(20) DEFAULT 'text' NOT NULL CHECK (message_type IN ('text', 'image', 'video')),
      attachment_url VARCHAR(512),
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS chat_question_stats (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      question_category VARCHAR(50),
      current_page VARCHAR(255),
      answer_quality INTEGER CHECK (answer_quality >= 1 AND answer_quality <= 5),
      was_helpful BOOLEAN,
      response_time INTEGER,
      is_difficult BOOLEAN DEFAULT FALSE NOT NULL,
      answer_length INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_question_stats_user_id ON chat_question_stats(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_question_stats_tenant_id ON chat_question_stats(tenant_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_question_stats_category ON chat_question_stats(question_category)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_question_stats_created_at ON chat_question_stats(created_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_chat_question_stats_is_difficult ON chat_question_stats(is_difficult)`);
}
