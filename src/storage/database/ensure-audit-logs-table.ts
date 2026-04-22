import { sql } from "drizzle-orm";
import { getDb } from "coze-coding-dev-sdk";
import * as auditSchema from "./shared/audit-schema";

export async function ensureAuditLogsTable(): Promise<void> {
  const db = await getDb(auditSchema);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      changes JSONB,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id TEXT`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action TEXT`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource TEXT`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id TEXT`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changes JSONB`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success'`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS error_message TEXT`);
  await db.execute(sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
}
