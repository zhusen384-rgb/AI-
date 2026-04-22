import { sql } from "drizzle-orm";
import { getDb } from "coze-coding-dev-sdk";
import * as schema from "@/storage/database/shared/schema";

const AI_POSITION_SCORE_RULES_LOCK_KEY = 90421031;

let isAiPositionScoreRulesTableReady = false;
let ensureAiPositionScoreRulesTablePromise: Promise<void> | null = null;

export async function ensureAiPositionScoreRulesTable(): Promise<void> {
  if (isAiPositionScoreRulesTableReady) {
    return;
  }

  if (ensureAiPositionScoreRulesTablePromise) {
    return ensureAiPositionScoreRulesTablePromise;
  }

  ensureAiPositionScoreRulesTablePromise = (async () => {
    const db = await getDb(schema);

    await db.execute(sql`SELECT pg_advisory_lock(${AI_POSITION_SCORE_RULES_LOCK_KEY})`);

    try {
      if (isAiPositionScoreRulesTableReady) {
        return;
      }

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ai_position_score_rules (
          id SERIAL PRIMARY KEY,
          position_key VARCHAR(100) NOT NULL UNIQUE,
          position_name VARCHAR(200) NOT NULL,
          rule_name VARCHAR(200) NOT NULL,
          rule_version VARCHAR(50) NOT NULL DEFAULT 'v1',
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          dimensions JSONB NOT NULL,
          thresholds JSONB NOT NULL,
          required_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
          interview_strategy JSONB NOT NULL DEFAULT '{}'::jsonb,
          prompt_template TEXT,
          question_bank JSONB,
          question_bank_count INTEGER DEFAULT 0,
          created_by VARCHAR(36),
          updated_by VARCHAR(36),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        )
      `);

      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS position_name VARCHAR(200) NOT NULL DEFAULT ''`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS rule_name VARCHAR(200) NOT NULL DEFAULT '默认评分规则'`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS rule_version VARCHAR(50) NOT NULL DEFAULT 'v1'`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS dimensions JSONB NOT NULL DEFAULT '[]'::jsonb`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS thresholds JSONB NOT NULL DEFAULT '{}'::jsonb`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS required_questions JSONB NOT NULL DEFAULT '[]'::jsonb`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS interview_strategy JSONB NOT NULL DEFAULT '{}'::jsonb`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS prompt_template TEXT`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS question_bank JSONB`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS question_bank_count INTEGER DEFAULT 0`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS created_by VARCHAR(36)`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS updated_by VARCHAR(36)`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL`);
      await db.execute(sql`ALTER TABLE ai_position_score_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL`);

      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_position_score_rules_position_key ON ai_position_score_rules(position_key)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_position_score_rules_status ON ai_position_score_rules(status)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ai_position_score_rules_updated_at ON ai_position_score_rules(updated_at)`);

      try {
        await db.execute(sql`
          ALTER TABLE ai_position_score_rules
          ADD CONSTRAINT fk_ai_position_score_rules_created_by
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        `);
      } catch {}

      try {
        await db.execute(sql`
          ALTER TABLE ai_position_score_rules
          ADD CONSTRAINT fk_ai_position_score_rules_updated_by
          FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        `);
      } catch {}

      await db.execute(sql`
        CREATE OR REPLACE FUNCTION update_ai_position_score_rules_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql'
      `);

      await db.execute(sql`
        DROP TRIGGER IF EXISTS update_ai_position_score_rules_updated_at ON ai_position_score_rules;
        CREATE TRIGGER update_ai_position_score_rules_updated_at
        BEFORE UPDATE ON ai_position_score_rules
        FOR EACH ROW EXECUTE FUNCTION update_ai_position_score_rules_updated_at()
      `);

      isAiPositionScoreRulesTableReady = true;
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${AI_POSITION_SCORE_RULES_LOCK_KEY})`);
    }
  })();

  try {
    await ensureAiPositionScoreRulesTablePromise;
  } catch (error) {
    ensureAiPositionScoreRulesTablePromise = null;
    throw error;
  }

  ensureAiPositionScoreRulesTablePromise = null;
}
