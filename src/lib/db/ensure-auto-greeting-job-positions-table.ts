import { getClient } from "coze-coding-dev-sdk";

export async function ensureAutoGreetingJobPositionsTable(): Promise<void> {
  const client = await getClient();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_job_positions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        department TEXT,
        location TEXT NOT NULL DEFAULT '待补充',
        salary_min INTEGER,
        salary_max INTEGER,
        requirements JSONB NOT NULL DEFAULT '{"skills":[],"experience":{"min":0},"education":[],"keywords":[]}'::jsonb,
        highlights JSONB DEFAULT '[]'::jsonb,
        company_intro TEXT,
        company_size TEXT,
        company_industry TEXT,
        target_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
        match_threshold INTEGER DEFAULT 60,
        second_greeting_enabled BOOLEAN DEFAULT FALSE,
        second_greeting_delay_hours INTEGER DEFAULT 24,
        human_simulation JSONB DEFAULT '{"batchPauseCount":10,"batchPauseSeconds":60,"maxGreetings":100,"minDelaySeconds":8,"maxDelaySeconds":25,"workingHoursStart":"09:00","workingHoursEnd":"18:00","nightMinDelaySeconds":30,"nightMaxDelaySeconds":60,"nightStartTime":"22:00","nightEndTime":"08:00"}'::jsonb,
        auto_reply_config JSONB DEFAULT '{"maxReplyLength":120,"maxRoundsNoResponse":3,"enableIntentDetection":true,"requestContactAfterRounds":3,"replyDelayMin":30,"replyDelayMax":90}'::jsonb,
        status TEXT DEFAULT 'active',
        paused_reason TEXT,
        position_id INTEGER,
        stats JSONB DEFAULT '{"totalGreeted":0,"totalReplied":0,"totalHighIntent":0,"totalResumeReceived":0,"totalContactReceived":0,"lastStatUpdate":""}'::jsonb,
        created_by_id TEXT,
        tenant_id TEXT,
        is_global BOOLEAN DEFAULT FALSE,
        created_by_name TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`ALTER TABLE ag_job_positions ADD COLUMN IF NOT EXISTS position_id INTEGER`);
    await client.query(`ALTER TABLE ag_job_positions ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '待补充'`);
    await client.query(`ALTER TABLE ag_job_positions ADD COLUMN IF NOT EXISTS target_platforms JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await client.query(`ALTER TABLE ag_job_positions ADD COLUMN IF NOT EXISTS requirements JSONB NOT NULL DEFAULT '{"skills":[],"experience":{"min":0},"education":[],"keywords":[]}'::jsonb`);
    await client.query(`ALTER TABLE ag_job_positions ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{"totalGreeted":0,"totalReplied":0,"totalHighIntent":0,"totalResumeReceived":0,"totalContactReceived":0,"lastStatUpdate":""}'::jsonb`);
    await client.query(`ALTER TABLE ag_job_positions ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
    await client.query(`ALTER TABLE ag_job_positions ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE ag_job_positions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_job_positions_status ON ag_job_positions(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_job_positions_created_by_id ON ag_job_positions(created_by_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_job_positions_tenant_id ON ag_job_positions(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_job_positions_is_global ON ag_job_positions(is_global)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_job_positions_position_id ON ag_job_positions(position_id)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ag_job_positions_position_id_unique ON ag_job_positions(position_id) WHERE position_id IS NOT NULL`);
  } finally {
    client.release();
  }
}
