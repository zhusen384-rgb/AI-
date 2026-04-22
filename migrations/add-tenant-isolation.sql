-- 为表添加租户和用户隔离字段
-- 运行此迁移脚本以支持多租户架构

-- 1. 为 full_ai_interview_configs 表添加字段
ALTER TABLE full_ai_interview_configs
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);

-- 2. 为 full_ai_interview_results 表添加字段
ALTER TABLE full_ai_interview_results
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);

-- 3. 为 full_ai_interview_statistics 表添加字段
ALTER TABLE full_ai_interview_statistics
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);

-- 4. 为 candidates 表添加字段
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);

-- 5. 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_full_ai_interview_configs_tenant ON full_ai_interview_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_full_ai_interview_configs_user ON full_ai_interview_configs(user_id);

CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_tenant ON full_ai_interview_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_full_ai_interview_results_user ON full_ai_interview_results(user_id);

CREATE INDEX IF NOT EXISTS idx_full_ai_interview_statistics_tenant ON full_ai_interview_statistics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_full_ai_interview_statistics_user ON full_ai_interview_statistics(user_id);

CREATE INDEX IF NOT EXISTS idx_candidates_tenant ON candidates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_candidates_user ON candidates(user_id);

-- 6. 为现有数据设置默认值（使用默认租户和 admin 用户）
-- 注意：在生产环境中，您需要根据实际业务逻辑设置这些值

-- 获取默认租户ID和管理员用户ID
DO $$
DECLARE
  default_tenant_id VARCHAR(36);
  admin_user_id VARCHAR(36);
BEGIN
  -- 获取默认租户ID
  SELECT id INTO default_tenant_id FROM tenants WHERE code = 'default' LIMIT 1;
  
  -- 获取管理员用户ID
  SELECT id INTO admin_user_id FROM users WHERE role = 'admin' LIMIT 1;
  
  -- 更新 full_ai_interview_configs
  UPDATE full_ai_interview_configs
  SET tenant_id = default_tenant_id, user_id = admin_user_id
  WHERE tenant_id IS NULL AND default_tenant_id IS NOT NULL;
  
  -- 更新 full_ai_interview_results
  UPDATE full_ai_interview_results
  SET tenant_id = default_tenant_id, user_id = admin_user_id
  WHERE tenant_id IS NULL AND default_tenant_id IS NOT NULL;
  
  -- 更新 full_ai_interview_statistics
  UPDATE full_ai_interview_statistics
  SET tenant_id = default_tenant_id, user_id = admin_user_id
  WHERE tenant_id IS NULL AND default_tenant_id IS NOT NULL;
  
  -- 更新 candidates
  UPDATE candidates
  SET tenant_id = default_tenant_id, user_id = admin_user_id
  WHERE tenant_id IS NULL AND default_tenant_id IS NOT NULL;
END $$;
