import { getClient } from "@/lib/db";
import { DEFAULT_INTERVIEWER_VOICE_ID } from "@/lib/interviewer-voice";

export async function ensureFullAiInterviewConfigsTable(): Promise<void> {
  const client = await getClient();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS full_ai_interview_configs (
        id SERIAL PRIMARY KEY,
        link_id TEXT NOT NULL UNIQUE,
        candidate_name TEXT NOT NULL,
        mode TEXT NOT NULL,
        position TEXT NOT NULL,
        resume TEXT NOT NULL DEFAULT '',
        interview_time TIMESTAMP,
        interviewer_voice TEXT NOT NULL DEFAULT '${DEFAULT_INTERVIEWER_VOICE_ID}',
        tenant_id TEXT,
        user_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(
      `ALTER TABLE full_ai_interview_configs ADD COLUMN IF NOT EXISTS interviewer_voice TEXT NOT NULL DEFAULT '${DEFAULT_INTERVIEWER_VOICE_ID}'`
    );
    await client.query(`ALTER TABLE full_ai_interview_configs ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
    await client.query(`ALTER TABLE full_ai_interview_configs ADD COLUMN IF NOT EXISTS user_id TEXT`);
    await client.query(
      `ALTER TABLE full_ai_interview_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`
    );

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_full_ai_interview_configs_link_id ON full_ai_interview_configs(link_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_full_ai_interview_configs_created_at ON full_ai_interview_configs(created_at)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_full_ai_interview_configs_tenant_id ON full_ai_interview_configs(tenant_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_full_ai_interview_configs_user_id ON full_ai_interview_configs(user_id)`
    );
  } finally {
    client.release();
  }
}
