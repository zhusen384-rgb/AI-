-- 添加登录日志表
CREATE TABLE IF NOT EXISTS login_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip VARCHAR(50),
  user_agent TEXT,
  login_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
  failure_reason VARCHAR(255),
  location JSONB,
  device JSONB
);

CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX idx_login_logs_status ON login_logs(status);
CREATE INDEX idx_login_logs_login_time ON login_logs(login_time);
CREATE INDEX idx_login_logs_ip ON login_logs(ip);

-- 添加邀请码表
CREATE TABLE IF NOT EXISTS invitation_codes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  created_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  max_uses INTEGER DEFAULT 1 NOT NULL,
  used_count INTEGER DEFAULT 0 NOT NULL,
  status VARCHAR(20) DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'inactive', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  used_by JSONB
);

CREATE INDEX idx_invitation_codes_code ON invitation_codes(code);
CREATE INDEX idx_invitation_codes_tenant_id ON invitation_codes(tenant_id);
CREATE INDEX idx_invitation_codes_created_by ON invitation_codes(created_by);
CREATE INDEX idx_invitation_codes_status ON invitation_codes(status);

-- 扩展 users 表添加新字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(36);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by VARCHAR(36);

-- 更新 role 列的约束
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'tenant_admin', 'interviewer', 'user', 'admin'));

-- 更新 status 列的约束
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'locked'));

-- 添加更新触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invitation_codes_updated_at BEFORE UPDATE ON invitation_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
