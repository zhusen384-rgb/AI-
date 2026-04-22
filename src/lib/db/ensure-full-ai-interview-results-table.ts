import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export async function ensureFullAiInterviewResultsTable(): Promise<void> {
  const db = await getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS full_ai_interview_results (
      id SERIAL PRIMARY KEY,
      link_id TEXT NOT NULL,
      interview_id TEXT NOT NULL,
      candidate_name TEXT NOT NULL,
      position TEXT NOT NULL,
      evaluation JSONB NOT NULL,
      recording_key TEXT,
      recording_url TEXT,
      qa_history JSONB,
      candidate_status JSONB NOT NULL,
      tenant_id TEXT,
      user_id TEXT,
      completed_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS link_id TEXT`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS interview_id TEXT`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS candidate_name TEXT`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS position TEXT`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS evaluation JSONB`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS recording_key TEXT`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS recording_url TEXT`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS qa_history JSONB`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS candidate_status JSONB`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);

  await db.execute(sql`UPDATE full_ai_interview_results SET candidate_status = '{"overallStatus":"normal","summary":"状态监控未启用","events":[],"statistics":{"totalDuration":0,"normalDuration":0,"abnormalDuration":0,"cheatingDuration":0,"faceDetectionRate":0,"faceLostCount":0,"multipleFaceCount":0,"suspiciousActions":0}}'::jsonb WHERE candidate_status IS NULL`);
  await db.execute(sql`UPDATE full_ai_interview_results SET qa_history = '[]'::jsonb WHERE qa_history IS NULL`);
  await db.execute(sql`UPDATE full_ai_interview_results SET completed_at = NOW() WHERE completed_at IS NULL`);

  await db.execute(sql`ALTER TABLE full_ai_interview_results ALTER COLUMN candidate_status SET DEFAULT '{"overallStatus":"normal","summary":"状态监控未启用","events":[],"statistics":{"totalDuration":0,"normalDuration":0,"abnormalDuration":0,"cheatingDuration":0,"faceDetectionRate":0,"faceLostCount":0,"multipleFaceCount":0,"suspiciousActions":0}}'::jsonb`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ALTER COLUMN qa_history SET DEFAULT '[]'::jsonb`);
  await db.execute(sql`ALTER TABLE full_ai_interview_results ALTER COLUMN created_at SET DEFAULT NOW()`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_interview_id ON full_ai_interview_results(interview_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_link_id ON full_ai_interview_results(link_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_completed_at ON full_ai_interview_results(completed_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_tenant_id ON full_ai_interview_results(tenant_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_user_id ON full_ai_interview_results(user_id)`);
}
