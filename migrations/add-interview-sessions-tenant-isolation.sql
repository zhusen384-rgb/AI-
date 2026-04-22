-- 为 interview_sessions 表添加租户和用户隔离字段
-- 运行此迁移脚本以支持多租户架构

-- 1. 为 interview_sessions 表添加字段
ALTER TABLE interview_sessions
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);

-- 2. 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_interview_sessions_tenant ON interview_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions(user_id);

-- 3. 为现有数据设置默认值（使用默认租户和 admin 用户）
DO $$
DECLARE
  default_tenant_id VARCHAR(36);
  admin_user_id VARCHAR(36);
BEGIN
  -- 获取默认租户ID
  SELECT id INTO default_tenant_id FROM tenants WHERE code = 'default' LIMIT 1;
  
  -- 获取管理员用户ID
  SELECT id INTO admin_user_id FROM users WHERE role = 'admin' LIMIT 1;
  
  -- 更新 interview_sessions
  UPDATE interview_sessions
  SET tenant_id = default_tenant_id, user_id = admin_user_id
  WHERE tenant_id IS NULL AND default_tenant_id IS NOT NULL;
END $$;
