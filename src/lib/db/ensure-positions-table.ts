import { sql } from "drizzle-orm";
import { getDb } from "coze-coding-dev-sdk";
import * as schema from "@/storage/database/shared/schema";

export async function ensurePositionsTable(): Promise<void> {
  const db = await getDb(schema);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      department VARCHAR(100) NOT NULL,
      job_description TEXT NOT NULL,
      education VARCHAR(50) NOT NULL,
      experience VARCHAR(100),
      status VARCHAR(20) DEFAULT 'active' NOT NULL,
      core_requirements JSONB,
      soft_skills JSONB,
      interviewer_preferences JSONB,
      veto_rules JSONB DEFAULT '[]'::jsonb,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
      is_global BOOLEAN DEFAULT false NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS core_requirements JSONB`);
  await db.execute(sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS soft_skills JSONB`);
  await db.execute(sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS interviewer_preferences JSONB`);
  await db.execute(sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS veto_rules JSONB DEFAULT '[]'::jsonb`);
  await db.execute(sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)`);
  await db.execute(sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36)`);
  await db.execute(sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false NOT NULL`);
  await db.execute(sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL`);
  await db.execute(sql`ALTER TABLE positions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL`);
  await db.execute(sql`UPDATE positions SET veto_rules = '[]'::jsonb WHERE veto_rules IS NULL`);
  await db.execute(sql`ALTER TABLE positions ALTER COLUMN veto_rules SET DEFAULT '[]'::jsonb`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_positions_user_id ON positions(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_positions_tenant_id ON positions(tenant_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_positions_department ON positions(department)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_positions_is_global ON positions(is_global)`);

  try {
    await db.execute(sql`
      ALTER TABLE positions
      ADD CONSTRAINT fk_positions_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    `);
  } catch {}

  try {
    await db.execute(sql`
      ALTER TABLE positions
      ADD CONSTRAINT fk_positions_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    `);
  } catch {}
}
