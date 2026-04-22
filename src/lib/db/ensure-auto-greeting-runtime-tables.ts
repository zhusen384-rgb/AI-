import { getClient } from "coze-coding-dev-sdk";
import { ensureAutoGreetingJobPositionsTable } from "@/lib/db/ensure-auto-greeting-job-positions-table";
import { ensureAutoGreetingTemplatesTable } from "@/lib/db/ensure-auto-greeting-templates-table";

export async function ensureAutoGreetingRuntimeTables(): Promise<void> {
  await ensureAutoGreetingJobPositionsTable();
  await ensureAutoGreetingTemplatesTable();

  const client = await getClient();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_platform_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        platform TEXT NOT NULL,
        account_id TEXT,
        nickname TEXT,
        cookies JSONB NOT NULL DEFAULT '[]'::jsonb,
        user_agent TEXT,
        last_login_time TIMESTAMP,
        last_active_time TIMESTAMP,
        login_status TEXT DEFAULT 'unknown',
        status TEXT DEFAULT 'active',
        created_by_id TEXT,
        tenant_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_candidate_communications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES ag_job_positions(id) ON DELETE CASCADE,
        account_id UUID REFERENCES ag_platform_accounts(id) ON DELETE SET NULL,
        name TEXT,
        platform TEXT NOT NULL,
        platform_user_id TEXT,
        platform_nickname TEXT,
        platform_avatar_url TEXT,
        candidate_info JSONB,
        match_score INTEGER,
        match_reasons JSONB,
        status TEXT DEFAULT '待打招呼',
        intent_level TEXT,
        candidate_intent TEXT,
        current_stage TEXT,
        reply_count INTEGER DEFAULT 0,
        first_greeting_time TIMESTAMP,
        first_greeting_message_id UUID,
        last_message_time TIMESTAMP,
        last_hr_message_time TIMESTAMP,
        last_candidate_message_time TIMESTAMP,
        last_reply_time TIMESTAMP,
        second_greeting_sent BOOLEAN DEFAULT FALSE,
        second_greeting_time TIMESTAMP,
        last_synced_at TIMESTAMP,
        communication_stats JSONB DEFAULT '{"hrMessageCount":0,"candidateMessageCount":0,"effectiveRounds":0,"lastEffectiveRoundTime":null}'::jsonb,
        received_info JSONB,
        tags JSONB DEFAULT '[]'::jsonb,
        manual_intervene BOOLEAN DEFAULT FALSE,
        manual_intervene_reason TEXT,
        manual_intervene_time TIMESTAMP,
        is_blacklisted BOOLEAN DEFAULT FALSE,
        blacklist_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_platform_user_job UNIQUE (platform, platform_user_id, job_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        communication_id UUID NOT NULL REFERENCES ag_candidate_communications(id) ON DELETE CASCADE,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        message_type TEXT DEFAULT 'text',
        send_method TEXT,
        is_auto BOOLEAN DEFAULT FALSE,
        template_id UUID,
        status TEXT DEFAULT 'pending',
        send_time TIMESTAMP,
        platform_message_id TEXT,
        attachments JSONB,
        ai_analysis JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_operation_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES ag_job_positions(id) ON DELETE SET NULL,
        communication_id UUID REFERENCES ag_candidate_communications(id) ON DELETE SET NULL,
        message_id UUID REFERENCES ag_messages(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        action TEXT,
        details JSONB,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        platform TEXT,
        operator_id TEXT,
        operator_type TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_qa_library (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES ag_job_positions(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        trigger_keywords JSONB NOT NULL DEFAULT '{"keywords":[],"matchType":"contains"}'::jsonb,
        question_examples JSONB DEFAULT '[]'::jsonb,
        answer TEXT NOT NULL,
        platform_answers JSONB,
        priority INTEGER DEFAULT 100,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_sensitive_words (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        word TEXT NOT NULL,
        category TEXT,
        severity TEXT DEFAULT 'medium',
        replacement TEXT,
        platforms JSONB,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_daily_statistics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date TEXT NOT NULL,
        job_id UUID REFERENCES ag_job_positions(id) ON DELETE CASCADE,
        platform TEXT,
        greeting_sent INTEGER DEFAULT 0,
        greeting_second_sent INTEGER DEFAULT 0,
        replied INTEGER DEFAULT 0,
        reply_rate INTEGER DEFAULT 0,
        intent_a INTEGER DEFAULT 0,
        intent_b INTEGER DEFAULT 0,
        intent_c INTEGER DEFAULT 0,
        intent_d INTEGER DEFAULT 0,
        resume_received INTEGER DEFAULT 0,
        contact_received INTEGER DEFAULT 0,
        manual_intervene INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_daily_stats UNIQUE (date, job_id, platform)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_account_health_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        score INTEGER NOT NULL,
        factors JSONB,
        status TEXT,
        trigger_event TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_conversation_stages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        communication_id UUID NOT NULL REFERENCES ag_candidate_communications(id) ON DELETE CASCADE,
        stage TEXT NOT NULL,
        entered_at TIMESTAMP NOT NULL,
        exited_at TIMESTAMP,
        rounds_in_stage INTEGER DEFAULT 0,
        transition_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_hook_usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        communication_id UUID REFERENCES ag_candidate_communications(id) ON DELETE CASCADE,
        hook_type TEXT,
        hook_content TEXT,
        personalization JSONB,
        got_reply BOOLEAN,
        reply_time_seconds INTEGER,
        expected_reply_rate INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_system_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        tenant_id TEXT,
        created_by_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ag_automation_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES ag_job_positions(id) ON DELETE CASCADE,
        account_id UUID NOT NULL REFERENCES ag_platform_accounts(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        task_type TEXT DEFAULT 'all',
        status TEXT DEFAULT 'pending',
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        state JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_heartbeat_at TIMESTAMP,
        last_execution_at TIMESTAMP,
        last_error TEXT,
        created_by_id TEXT,
        tenant_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`ALTER TABLE ag_platform_accounts ADD COLUMN IF NOT EXISTS created_by_id TEXT`);
    await client.query(`ALTER TABLE ag_platform_accounts ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
    await client.query(`ALTER TABLE ag_candidate_communications ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES ag_platform_accounts(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE ag_candidate_communications ADD COLUMN IF NOT EXISTS candidate_intent TEXT`);
    await client.query(`ALTER TABLE ag_candidate_communications ADD COLUMN IF NOT EXISTS current_stage TEXT`);
    await client.query(`ALTER TABLE ag_candidate_communications ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE ag_candidate_communications ADD COLUMN IF NOT EXISTS last_reply_time TIMESTAMP`);
    await client.query(`ALTER TABLE ag_candidate_communications ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP`);
    await client.query(`ALTER TABLE ag_messages ADD COLUMN IF NOT EXISTS send_method TEXT`);
    await client.query(`ALTER TABLE ag_messages ADD COLUMN IF NOT EXISTS platform_message_id TEXT`);
    await client.query(`ALTER TABLE ag_messages ADD COLUMN IF NOT EXISTS ai_analysis JSONB`);
    await client.query(`ALTER TABLE ag_messages ADD COLUMN IF NOT EXISTS attachments JSONB`);
    await client.query(`ALTER TABLE ag_system_config ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
    await client.query(`ALTER TABLE ag_system_config ADD COLUMN IF NOT EXISTS created_by_id TEXT`);
    await client.query(`ALTER TABLE ag_automation_tasks ADD COLUMN IF NOT EXISTS created_by_id TEXT`);
    await client.query(`ALTER TABLE ag_automation_tasks ADD COLUMN IF NOT EXISTS tenant_id TEXT`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_platform_accounts_platform ON ag_platform_accounts(platform)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_platform_accounts_created_by_id ON ag_platform_accounts(created_by_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_candidate_communications_job_id ON ag_candidate_communications(job_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_candidate_communications_account_id ON ag_candidate_communications(account_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_candidate_communications_platform_user_id ON ag_candidate_communications(platform_user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_messages_communication_id ON ag_messages(communication_id)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ag_messages_platform_message_id_unique ON ag_messages(platform_message_id) WHERE platform_message_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_operation_logs_communication_id ON ag_operation_logs(communication_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_qa_library_job_id ON ag_qa_library(job_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_sensitive_words_word ON ag_sensitive_words(word)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_daily_statistics_job_id ON ag_daily_statistics(job_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_account_health_logs_account_id ON ag_account_health_logs(account_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_conversation_stages_communication_id ON ag_conversation_stages(communication_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_hook_usage_logs_communication_id ON ag_hook_usage_logs(communication_id)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ag_system_config_category_key ON ag_system_config(category, key)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_automation_tasks_status ON ag_automation_tasks(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_automation_tasks_job_id ON ag_automation_tasks(job_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ag_automation_tasks_account_id ON ag_automation_tasks(account_id)`);
  } finally {
    client.release();
  }
}
