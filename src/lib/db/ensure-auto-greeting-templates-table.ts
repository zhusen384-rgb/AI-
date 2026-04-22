import { getClient } from "coze-coding-dev-sdk";
import { ensureAutoGreetingJobPositionsTable } from "@/lib/db/ensure-auto-greeting-job-positions-table";

export async function ensureAutoGreetingTemplatesTable(): Promise<void> {
  await ensureAutoGreetingJobPositionsTable();

  const client = await getClient();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_greeting_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES ag_job_positions(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        platform TEXT NOT NULL,
        template TEXT NOT NULL,
        variables JSONB,
        is_active BOOLEAN DEFAULT TRUE,
        use_count INTEGER DEFAULT 0,
        created_by_id TEXT,
        tenant_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`ALTER TABLE ag_greeting_templates ADD COLUMN IF NOT EXISTS variables JSONB`);
    await client.query(`ALTER TABLE ag_greeting_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
    await client.query(`ALTER TABLE ag_greeting_templates ADD COLUMN IF NOT EXISTS use_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE ag_greeting_templates ADD COLUMN IF NOT EXISTS created_by_id TEXT`);
    await client.query(`ALTER TABLE ag_greeting_templates ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
    await client.query(`ALTER TABLE ag_greeting_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_greeting_templates_job_id ON ag_greeting_templates(job_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_greeting_templates_type ON ag_greeting_templates(type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_greeting_templates_platform ON ag_greeting_templates(platform)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_greeting_templates_created_by_id ON ag_greeting_templates(created_by_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_greeting_templates_tenant_id ON ag_greeting_templates(tenant_id)`);
  } finally {
    client.release();
  }
}
