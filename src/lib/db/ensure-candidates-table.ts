import { sql } from "drizzle-orm";
import { getDb } from "coze-coding-dev-sdk";
import * as schema from "@/lib/db/schema";

export async function ensureCandidatesTable(): Promise<void> {
  const db = await getDb(schema);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS candidates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT,
      school TEXT,
      major TEXT,
      education TEXT,
      phone TEXT,
      email TEXT,
      position TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT,
      resume_uploaded BOOLEAN NOT NULL DEFAULT false,
      resume_file_name TEXT,
      resume_file_key TEXT,
      resume_download_url TEXT,
      resume_parsed_data JSONB,
      resume_uploaded_at TEXT,
      interview_stage TEXT NOT NULL DEFAULT 'pending',
      initial_interview_passed TEXT,
      second_interview_passed TEXT,
      final_interview_passed TEXT,
      is_hired BOOLEAN NOT NULL DEFAULT false,
      initial_interview_time TEXT,
      second_interview_time TEXT,
      final_interview_time TEXT,
      initial_interview_evaluation TEXT,
      second_interview_evaluation TEXT,
      final_interview_evaluation TEXT,
      created_by_id TEXT,
      created_by_name TEXT,
      created_by_username TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS gender TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS school TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS major TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS education TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS position TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_uploaded BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_file_name TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_file_key TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_download_url TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_parsed_data JSONB`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_uploaded_at TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_stage TEXT NOT NULL DEFAULT 'pending'`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS initial_interview_passed TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS second_interview_passed TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS final_interview_passed TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_hired BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS initial_interview_time TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS second_interview_time TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS final_interview_time TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS initial_interview_evaluation TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS second_interview_evaluation TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS final_interview_evaluation TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS created_by_id TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS created_by_name TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS created_by_username TEXT`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
}
