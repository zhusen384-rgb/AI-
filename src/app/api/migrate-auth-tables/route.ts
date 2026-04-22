import { NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import { sql } from 'drizzle-orm';

/**
 * 执行认证安全表的数据库迁移
 * 创建 login_logs 和 invitation_codes 表
 */
export async function POST() {
  try {
    console.log('开始执行数据库迁移 - 添加认证安全表...');

    const db = await getDb();

    // 创建 login_logs 表
    console.log('创建 login_logs 表...');
    await db.execute(sql`
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
      )
    `);

    // 创建索引
    console.log('创建 login_logs 索引...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_login_logs_status ON login_logs(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_login_logs_login_time ON login_logs(login_time)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_login_logs_ip ON login_logs(ip)`);

    // 创建 invitation_codes 表
    console.log('创建 invitation_codes 表...');
    await db.execute(sql`
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
      )
    `);

    // 创建索引
    console.log('创建 invitation_codes 索引...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_invitation_codes_tenant_id ON invitation_codes(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_invitation_codes_created_by ON invitation_codes(created_by)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_invitation_codes_status ON invitation_codes(status)`);

    // 扩展 users 表添加新字段
    console.log('扩展 users 表...');
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(50)`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(36)`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by VARCHAR(36)`);

    // 更新 role 列的约束
    console.log('更新 users 表约束...');
    await db.execute(sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await db.execute(sql`
      ALTER TABLE users ADD CONSTRAINT users_role_check 
      CHECK (role IN ('super_admin', 'tenant_admin', 'interviewer', 'user', 'admin'))
    `);

    // 更新 status 列的约束
    await db.execute(sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check`);
    await db.execute(sql`
      ALTER TABLE users ADD CONSTRAINT users_status_check 
      CHECK (status IN ('active', 'inactive', 'locked'))
    `);

    console.log('✅ 数据库迁移成功完成！');

    return NextResponse.json({
      success: true,
      message: '数据库迁移成功完成',
      tables: ['login_logs', 'invitation_codes'],
      fields: ['users.login_count', 'users.last_login_ip', 'users.created_by', 'users.updated_by'],
    });
  } catch (error) {
    console.error('❌ 数据库迁移失败：', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '数据库迁移失败',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
