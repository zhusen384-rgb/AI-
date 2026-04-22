import { sql } from "drizzle-orm";
import { getDb } from "coze-coding-dev-sdk";
import * as schema from "@/lib/db/schema";

export async function ensureResumesTable(): Promise<void> {
  const db = await getDb(schema);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS resumes (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      parsed_data JSONB,
      conflict_markers JSONB,
      resume_text TEXT,
      keywords TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS candidate_id INTEGER`);
  await db.execute(sql`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_name TEXT`);
  await db.execute(sql`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_url TEXT`);
  await db.execute(sql`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS parsed_data JSONB`);
  await db.execute(sql`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS conflict_markers JSONB`);
  await db.execute(sql`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS resume_text TEXT`);
  await db.execute(sql`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS keywords TEXT`);
  await db.execute(sql`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_resumes_candidate_id ON resumes(candidate_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes(created_at)`);
}
