import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateApi, isSuperAdmin } from '@/lib/api-auth';

/**
 * 创建用户活动日志表
 * 仅超级管理员可访问
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);

    // 权限检查：只有超级管理员可以执行迁移
    if (!isSuperAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅超级管理员可执行迁移' },
        { status: 403 }
      );
    }

    const db = await getDb();

    // 检查表是否已存在
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_activity_logs'
      );
    `);

    if (tableExists.rows[0]?.exists) {
      return NextResponse.json({
        success: true,
        message: '用户活动日志表已存在',
      });
    }

    // 创建用户活动日志表
    await db.execute(sql`
      CREATE TABLE user_activity_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        resource VARCHAR(50) NOT NULL,
        resource_id VARCHAR(100),
        resource_name VARCHAR(255),
        detail JSONB,
        ip VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);

    // 创建索引
    await db.execute(sql`
      CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs(user_id);
      CREATE INDEX idx_user_activity_logs_tenant_id ON user_activity_logs(tenant_id);
      CREATE INDEX idx_user_activity_logs_action ON user_activity_logs(action);
      CREATE INDEX idx_user_activity_logs_resource ON user_activity_logs(resource);
      CREATE INDEX idx_user_activity_logs_created_at ON user_activity_logs(created_at);
    `);

    return NextResponse.json({
      success: true,
      message: '用户活动日志表创建成功',
    });
  } catch (error) {
    console.error('[迁移API] 创建活动日志表失败:', error);

    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: '创建活动日志表失败' },
      { status: 500 }
    );
  }
}

import { sql } from 'drizzle-orm';
