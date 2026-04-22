import { sql } from "drizzle-orm";
import { getDb } from "coze-coding-dev-sdk";
import * as schema from "@/lib/db/schema";

export async function ensureResumeParseTasksTable(): Promise<void> {
  const db = await getDb(schema);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS resume_parse_tasks (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      tenant_id VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      total_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      results JSONB NOT NULL DEFAULT '[]'::jsonb,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(255)`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS status VARCHAR(50)`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS total_count INTEGER`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS processed_count INTEGER`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS success_count INTEGER`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS failed_count INTEGER`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS results JSONB`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS error_message TEXT`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);

  await db.execute(sql`UPDATE resume_parse_tasks SET results = '[]'::jsonb WHERE results IS NULL`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ALTER COLUMN status SET DEFAULT 'pending'`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ALTER COLUMN total_count SET DEFAULT 0`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ALTER COLUMN processed_count SET DEFAULT 0`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ALTER COLUMN success_count SET DEFAULT 0`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ALTER COLUMN failed_count SET DEFAULT 0`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ALTER COLUMN results SET DEFAULT '[]'::jsonb`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ALTER COLUMN created_at SET DEFAULT NOW()`);
  await db.execute(sql`ALTER TABLE resume_parse_tasks ALTER COLUMN updated_at SET DEFAULT NOW()`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_resume_parse_tasks_user_id ON resume_parse_tasks(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_resume_parse_tasks_status ON resume_parse_tasks(status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_resume_parse_tasks_created_at ON resume_parse_tasks(created_at)`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_parse_tasks_unique_user
    ON resume_parse_tasks(user_id)
    WHERE status IN ('pending', 'processing')
  `);
}
