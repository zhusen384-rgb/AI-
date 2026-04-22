/**
 * 自动打招呼沟通智能体 - 数据库迁移脚本
 * 
 * 运行方式：npx tsx migrations/run-auto-greeting-migration.ts
 */

import { getClient } from 'coze-coding-dev-sdk';
import type { PoolClient } from 'pg';

// SQL 创建表语句
const CREATE_TABLES_SQL = `
-- ============================================================================
-- 1. 岗位配置表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_job_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 基本信息
  name TEXT NOT NULL,
  department TEXT,
  location TEXT NOT NULL,
  salary_min INTEGER,
  salary_max INTEGER,
  
  -- 岗位要求
  requirements JSONB NOT NULL,
  
  -- 岗位亮点
  highlights JSONB DEFAULT '[]'::jsonb,
  
  -- 公司信息
  company_intro TEXT,
  company_size TEXT,
  company_industry TEXT,
  
  -- 平台配置
  target_platforms JSONB NOT NULL,
  
  -- 匹配配置
  match_threshold INTEGER DEFAULT 60,
  
  -- 二次打招呼配置
  second_greeting_enabled BOOLEAN DEFAULT FALSE,
  second_greeting_delay_hours INTEGER DEFAULT 24,
  
  -- 真人模拟配置
  human_simulation JSONB DEFAULT '{"batchPauseCount":10,"batchPauseSeconds":60,"minDelaySeconds":8,"maxDelaySeconds":25,"nightMinDelaySeconds":30,"nightMaxDelaySeconds":60,"nightStartTime":"22:00","nightEndTime":"08:00"}'::jsonb,
  
  -- 自动回复配置
  auto_reply_config JSONB DEFAULT '{"maxReplyLength":120,"maxRoundsNoResponse":3,"enableIntentDetection":true,"requestContactAfterRounds":3}'::jsonb,
  
  -- 状态
  status TEXT DEFAULT 'active',
  paused_reason TEXT,
  
  -- 统计数据
  stats JSONB DEFAULT '{"totalGreeted":0,"totalReplied":0,"totalHighIntent":0,"totalResumeReceived":0,"totalContactReceived":0,"lastStatUpdate":""}'::jsonb,
  
  -- 审计字段
  created_by_id TEXT,
  created_by_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ag_job_positions IS '自动打招呼 - 岗位配置表';

-- ============================================================================
-- 2. 打招呼模板表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_greeting_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES ag_job_positions(id) ON DELETE CASCADE,
  
  -- 模板类型
  type TEXT NOT NULL,
  
  -- 平台适配
  platform TEXT NOT NULL,
  
  -- 模板内容
  template TEXT NOT NULL,
  
  -- 变量说明
  variables JSONB,
  
  -- 状态
  is_active BOOLEAN DEFAULT TRUE,
  
  -- 使用统计
  use_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ag_greeting_templates IS '自动打招呼 - 打招呼模板表';

-- ============================================================================
-- 3. 问答库表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_qa_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES ag_job_positions(id) ON DELETE CASCADE,
  
  -- 分类
  category TEXT NOT NULL,
  
  -- 触发关键词
  trigger_keywords JSONB NOT NULL,
  
  -- 问题示例
  question_examples JSONB,
  
  -- 回答内容
  answer TEXT NOT NULL,
  
  -- 平台适配
  platform_answers JSONB,
  
  -- 优先级
  priority INTEGER DEFAULT 100,
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ag_qa_library IS '自动打招呼 - 问答库表';

-- ============================================================================
-- 4. 候选人沟通记录表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_candidate_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES ag_job_positions(id) ON DELETE CASCADE,
  
  -- 候选人基础信息
  name TEXT,
  platform TEXT NOT NULL,
  platform_user_id TEXT,
  platform_nickname TEXT,
  platform_avatar_url TEXT,
  
  -- 候选人简历信息
  candidate_info JSONB,
  
  -- 匹配信息
  match_score INTEGER,
  match_reasons JSONB,
  
  -- 沟通状态
  status TEXT DEFAULT '待打招呼',
  intent_level TEXT,
  
  -- 时间记录
  first_greeting_time TIMESTAMP,
  first_greeting_message_id UUID,
  last_message_time TIMESTAMP,
  last_hr_message_time TIMESTAMP,
  last_candidate_message_time TIMESTAMP,
  second_greeting_sent BOOLEAN DEFAULT FALSE,
  second_greeting_time TIMESTAMP,
  
  -- 沟通统计
  communication_stats JSONB DEFAULT '{"hrMessageCount":0,"candidateMessageCount":0,"effectiveRounds":0,"lastEffectiveRoundTime":null}'::jsonb,
  
  -- 获取到的信息
  received_info JSONB,
  
  -- 标签
  tags JSONB DEFAULT '[]'::jsonb,
  
  -- 人工介入标记
  manual_intervene BOOLEAN DEFAULT FALSE,
  manual_intervene_reason TEXT,
  manual_intervene_time TIMESTAMP,
  
  -- 黑名单标记
  is_blacklisted BOOLEAN DEFAULT FALSE,
  blacklist_reason TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- 唯一约束
  CONSTRAINT unique_platform_user_job UNIQUE (platform, platform_user_id, job_id)
);

COMMENT ON TABLE ag_candidate_communications IS '自动打招呼 - 候选人沟通记录表';

-- ============================================================================
-- 5. 消息记录表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES ag_candidate_communications(id) ON DELETE CASCADE,
  
  -- 消息基本信息
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  
  -- 消息类型
  message_type TEXT DEFAULT 'text',
  
  -- 发送方式
  send_method TEXT,
  is_auto BOOLEAN DEFAULT FALSE,
  
  -- 关联的模板
  template_id UUID,
  
  -- 发送状态
  status TEXT DEFAULT 'pending',
  send_time TIMESTAMP,
  platform_message_id TEXT,
  
  -- 附件信息
  attachments JSONB,
  
  -- AI 分析结果
  ai_analysis JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ag_messages IS '自动打招呼 - 消息记录表';

-- ============================================================================
-- 6. 操作日志表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_operation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 关联信息
  job_id UUID REFERENCES ag_job_positions(id) ON DELETE SET NULL,
  communication_id UUID REFERENCES ag_candidate_communications(id) ON DELETE SET NULL,
  message_id UUID REFERENCES ag_messages(id) ON DELETE SET NULL,
  
  -- 操作类型
  type TEXT NOT NULL,
  action TEXT,
  
  -- 操作详情
  details JSONB,
  
  -- 结果
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  
  -- 上下文
  platform TEXT,
  operator_id TEXT,
  operator_type TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ag_operation_logs IS '自动打招呼 - 操作日志表';

-- ============================================================================
-- 7. 敏感词库表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_sensitive_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  word TEXT NOT NULL,
  category TEXT,
  severity TEXT DEFAULT 'medium',
  
  -- 替换词
  replacement TEXT,
  
  -- 适用平台
  platforms JSONB,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ag_sensitive_words IS '自动打招呼 - 敏感词库表';

-- ============================================================================
-- 8. 每日统计表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_daily_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 统计维度
  date TEXT NOT NULL,
  job_id UUID REFERENCES ag_job_positions(id) ON DELETE CASCADE,
  platform TEXT,
  
  -- 打招呼统计
  greeting_sent INTEGER DEFAULT 0,
  greeting_second_sent INTEGER DEFAULT 0,
  
  -- 回复统计
  replied INTEGER DEFAULT 0,
  reply_rate INTEGER DEFAULT 0,
  
  -- 意向统计
  intent_a INTEGER DEFAULT 0,
  intent_b INTEGER DEFAULT 0,
  intent_c INTEGER DEFAULT 0,
  intent_d INTEGER DEFAULT 0,
  
  -- 转化统计
  resume_received INTEGER DEFAULT 0,
  contact_received INTEGER DEFAULT 0,
  manual_intervene INTEGER DEFAULT 0,
  
  -- 错误统计
  errors INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- 唯一约束
  CONSTRAINT unique_date_job_platform UNIQUE (date, job_id, platform)
);

COMMENT ON TABLE ag_daily_statistics IS '自动打招呼 - 每日统计表';

-- ============================================================================
-- 9. 账号健康日志表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_account_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  
  -- 分数
  score INTEGER NOT NULL,
  factors JSONB,
  
  -- 状态
  status TEXT,
  
  -- 触发的事件
  trigger_event TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ag_account_health_logs IS '自动打招呼 - 账号健康日志表';

-- ============================================================================
-- 10. 对话阶段记录表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_conversation_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID NOT NULL REFERENCES ag_candidate_communications(id) ON DELETE CASCADE,
  
  -- 阶段信息
  stage TEXT NOT NULL,
  
  -- 进入/退出时间
  entered_at TIMESTAMP NOT NULL,
  exited_at TIMESTAMP,
  
  -- 阶段统计
  rounds_in_stage INTEGER DEFAULT 0,
  
  -- 转换原因
  transition_reason TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ag_conversation_stages IS '自动打招呼 - 对话阶段记录表';

-- ============================================================================
-- 11. 钩子使用日志表
-- ============================================================================
CREATE TABLE IF NOT EXISTS ag_hook_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id UUID REFERENCES ag_candidate_communications(id) ON DELETE SET NULL,
  
  -- 钩子信息
  hook_type TEXT,
  hook_content TEXT,
  
  -- 个性化元素
  personalization JSONB,
  
  -- 效果
  got_reply BOOLEAN,
  reply_time_seconds INTEGER,
  
  -- 预期
  expected_reply_rate INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ag_hook_usage_logs IS '自动打招呼 - 钩子使用日志表';

-- ============================================================================
-- 创建索引
-- ============================================================================

-- 岗位表索引
CREATE INDEX IF NOT EXISTS idx_ag_job_positions_status ON ag_job_positions(status);
CREATE INDEX IF NOT EXISTS idx_ag_job_positions_created_by_id ON ag_job_positions(created_by_id);

-- 模板表索引
CREATE INDEX IF NOT EXISTS idx_ag_greeting_templates_job_id ON ag_greeting_templates(job_id);
CREATE INDEX IF NOT EXISTS idx_ag_greeting_templates_type ON ag_greeting_templates(type);

-- 问答库索引
CREATE INDEX IF NOT EXISTS idx_ag_qa_library_job_id ON ag_qa_library(job_id);
CREATE INDEX IF NOT EXISTS idx_ag_qa_library_category ON ag_qa_library(category);

-- 候选人沟通记录索引
CREATE INDEX IF NOT EXISTS idx_ag_candidate_communications_job_id ON ag_candidate_communications(job_id);
CREATE INDEX IF NOT EXISTS idx_ag_candidate_communications_status ON ag_candidate_communications(status);
CREATE INDEX IF NOT EXISTS idx_ag_candidate_communications_platform ON ag_candidate_communications(platform);
CREATE INDEX IF NOT EXISTS idx_ag_candidate_communications_intent_level ON ag_candidate_communications(intent_level);

-- 消息表索引
CREATE INDEX IF NOT EXISTS idx_ag_messages_communication_id ON ag_messages(communication_id);
CREATE INDEX IF NOT EXISTS idx_ag_messages_created_at ON ag_messages(created_at);

-- 操作日志索引
CREATE INDEX IF NOT EXISTS idx_ag_operation_logs_type ON ag_operation_logs(type);
CREATE INDEX IF NOT EXISTS idx_ag_operation_logs_created_at ON ag_operation_logs(created_at);

-- 每日统计索引
CREATE INDEX IF NOT EXISTS idx_ag_daily_statistics_date ON ag_daily_statistics(date);

-- ============================================================================
-- 插入默认敏感词
-- ============================================================================

INSERT INTO ag_sensitive_words (word, category, severity) VALUES
-- 平台违规
('微信转账', '平台违规', 'high'),
('支付宝转账', '平台违规', 'high'),
('红包', '平台违规', 'medium'),
('返现', '平台违规', 'medium'),
('加微信聊', '平台违规', 'medium'),
('私下交易', '平台违规', 'high'),
('绕过平台', '平台违规', 'critical'),
-- 个人隐私
('身份证号', '个人隐私', 'critical'),
('银行卡号', '个人隐私', 'critical'),
('密码', '个人隐私', 'critical')
ON CONFLICT DO NOTHING;
`;

// 迁移函数
async function runMigration() {
  let client: PoolClient | null = null;
  
  try {
    console.log('开始执行自动打招呼模块数据库迁移...');
    
    client = await getClient();
    
    // 开始事务
    await client.query('BEGIN');
    
    // 执行创建表语句
    await client.query(CREATE_TABLES_SQL);
    
    // 提交事务
    await client.query('COMMIT');
    
    console.log('✅ 数据库迁移成功！');
    console.log('已创建以下表：');
    console.log('  - ag_job_positions (岗位配置表)');
    console.log('  - ag_greeting_templates (打招呼模板表)');
    console.log('  - ag_qa_library (问答库表)');
    console.log('  - ag_candidate_communications (候选人沟通记录表)');
    console.log('  - ag_messages (消息记录表)');
    console.log('  - ag_operation_logs (操作日志表)');
    console.log('  - ag_sensitive_words (敏感词库表)');
    console.log('  - ag_daily_statistics (每日统计表)');
    console.log('  - ag_account_health_logs (账号健康日志表)');
    console.log('  - ag_conversation_stages (对话阶段记录表)');
    console.log('  - ag_hook_usage_logs (钩子使用日志表)');
    
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('❌ 数据库迁移失败:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// 执行迁移
runMigration().catch(console.error);
